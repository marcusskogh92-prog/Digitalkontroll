import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ensureFolderPath, uploadFile } from '../../../services/azure/fileService';
import { deleteDriveItemById, getDriveItemByPath, moveDriveItemById, renameDriveItemById } from '../../../services/azure/hierarchyService';
import { getSiteByUrl } from '../../../services/azure/siteService';
import { getSharePointFolderItems } from '../../../services/sharepoint/sharePointStructureService';
import { buildLockedFileRename, normalizeLockedRenameBase, splitBaseAndExt as splitLockedBaseAndExt } from '../../../utils/lockedFileRename';
import { filesFromDataTransfer, filesFromFileList } from '../../../utils/webDirectoryFiles';
import ContextMenu from '../../ContextMenu';
import FileActionModal from '../Modals/FileActionModal';
import FilePreviewModal from '../Modals/FilePreviewModal';
import { useUploadManager } from '../uploads/UploadManagerContext';
import SharePointFilePreviewPane from './SharePointFilePreviewPane';
import { ALLOWED_UPLOAD_EXTENSIONS, classifyFileType, dedupeFileName, dedupeFolderName, fileExtFromName, isAllowedUploadFile, safeText } from './sharePointFileUtils';

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

function sanitizeSharePointFolderSegment(name) {
  // Match behavior in createFolder(); keep it conservative.
  const s = safeText(name).trim();
  if (!s) return '';
  return s.replace(/[\\/:*?"<>|]/g, '-').trim();
}

function sanitizeSharePointRelativePath(relPath) {
  const raw = safeText(relPath).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!raw) return '';
  return raw
    .split('/')
    .filter(Boolean)
    .map((seg) => sanitizeSharePointFolderSegment(seg))
    .filter(Boolean)
    .join('/');
}

async function runWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const n = Math.max(1, Number(concurrency) || 1);
  let idx = 0;

  const runners = Array.from({ length: Math.min(n, list.length) }).map(async () => {
    while (true) {
      const i = idx;
      idx += 1;
      if (i >= list.length) break;
      await worker(list[i], i);
    }
  });

  await Promise.all(runners);
}

function normalizeKey(value) {
  const s = safeText(value).trim().toLowerCase();
  if (!s) return '';
  try {
    return s
      .normalize('NFD')
      .replace(/\p{Diacritic}+/gu, '')
      .replace(/\s+/g, ' ')
      .replace(/[–—]/g, '-')
      .trim();
  } catch (_e) {
    return s.replace(/\s+/g, ' ').replace(/[–—]/g, '-').trim();
  }
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

  // Inline preview behavior:
  // - 'toggle' (default): show a toolbar button to show/hide preview.
  // - 'on-select-only': no toolbar button; preview pane only appears when a file is selected.
  inlinePreviewMode = 'toggle',

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

  // FFU-only (opt-in): create + pin + lock a system folder.
  systemFolderName = null,
  ensureSystemFolder = false,
  pinSystemFolderLast = false,
  lockSystemFolder = false,
  systemFolderRootOnly = true,
}) {
  // Keep "Senast ändrad" anchored to the right, while letting other columns share space closer to Filnamn.
  const COL_DATE_W = 140;
  const COL_MENU_W = 46;

  const cid = safeText(companyId);
  const hasContext = Boolean(cid && safeText(rootPath));

  const [siteId, setSiteId] = useState('');
  const [siteError, setSiteError] = useState('');
  const sharePointNotLinked = useMemo(() => {
    // Only treat this as "not linked" when we explicitly know the identifier is missing.
    const msg = safeText(siteError).toLowerCase();
    return Boolean(hasContext && !safeText(siteId) && msg.includes('saknas'));
  }, [hasContext, siteError, siteId]);

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

  const isSystemFolder = useCallback((it) => {
    if (!it || it?.type !== 'folder') return false;
    const sys = normalizeKey(systemFolderName);
    if (!sys) return false;
    if (systemFolderRootOnly && safeText(relativePath) !== '') return false;
    return normalizeKey(it?.name) === sys;
  }, [systemFolderName, systemFolderRootOnly, relativePath]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  const [previewItemId, setPreviewItemId] = useState(null);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewNumPages, setPreviewNumPages] = useState(null);

  // Web drag/drop state (single source of truth)
  const [isDragging, setIsDragging] = useState(false);
  const [activeDropFolder, setActiveDropFolder] = useState(null); // relativePath | null
  const [tableHeaderHeight, setTableHeaderHeight] = useState(44);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const lastWebClickRef = useRef({ id: '', t: 0 });
  const tableDragDepthRef = useRef(0);
  const tableRootRef = useRef(null);
  const isDraggingRef = useRef(false);
  const activeDropFolderRef = useRef('');
  const uploadEntriesWithPathsRef = useRef(null);

  const uploadManager = useUploadManager();
  const [dragOverBreadcrumbRelPath, setDragOverBreadcrumbRelPath] = useState('');

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

  const dndTipText = 'Du kan dra och släppa filer och mappar direkt i listan';
  const enableWebDnD = Platform.OS === 'web';

  const isListEmpty = useMemo(() => !loading && Array.isArray(items) && items.length === 0, [loading, items]);

  const setIsDraggingSafe = useCallback((next) => {
    const v = Boolean(next);
    isDraggingRef.current = v;
    setIsDragging(v);
  }, []);

  const setActiveDropFolderSafe = useCallback((nextRelPathOrNull) => {
    const v = safeText(nextRelPathOrNull);
    activeDropFolderRef.current = v;
    setActiveDropFolder(v ? v : null);
  }, []);

  const resetDragState = useCallback(() => {
    tableDragDepthRef.current = 0;
    setIsDraggingSafe(false);
    setActiveDropFolderSafe(null);
  }, [setIsDraggingSafe, setActiveDropFolderSafe]);

  const isTableDragActive = Platform.OS === 'web' && enableWebDnD && isDragging && !safeText(activeDropFolder);

  const isWidePreviewLayout = useMemo(() => {
    const w = Dimensions.get('window')?.width || 1200;
    return Platform.OS === 'web' && w >= 1180;
  }, []);

  const previewMode = String(inlinePreviewMode || 'toggle').trim().toLowerCase();

  // Listan ska visa metadata (på web), men previewn ska vara ren.
  const showListMetadataColumns = Platform.OS === 'web';
  const isCompactTable = !showListMetadataColumns;

  const previewItem = useMemo(() => {
    if (!enableInlinePreview) return null;
    const id = safeText(previewItemId);
    if (!id) return null;
    return (Array.isArray(items) ? items : []).find((x) => x?.type === 'file' && safeText(x?.id) === id) || null;
  }, [enableInlinePreview, items, previewItemId]);

  const isInlinePreviewVisible = Boolean(
    enableInlinePreview &&
    (previewMode === 'on-select-only'
      ? !!previewItem
      : previewEnabled),
  );

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

      if (ensureSystemFolder && safeText(systemFolderName) && (!systemFolderRootOnly || safeText(relativePath) === '')) {
        // FFU: ensure system folder exists in the root.
        await ensureFolderPath(joinPath(rootPath, systemFolderName), cid, siteId, { siteRole: 'projects', strict: true });
      }

      const next = await getSharePointFolderItems(siteId, `/${currentPath}`);

      const folders = (Array.isArray(next) ? next : []).filter((x) => x?.type === 'folder');
      const files = (Array.isArray(next) ? next : []).filter((x) => x?.type === 'file');

      folders.sort((a, b) => {
        if (pinSystemFolderLast) {
          const aSys = isSystemFolder(a);
          const bSys = isSystemFolder(b);
          if (aSys && !bSys) return 1;
          if (!aSys && bSys) return -1;
        }
        return safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' });
      });
      files.sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' }));

      setItems([...folders, ...files]);
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte läsa filer från SharePoint.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [
    hasContext,
    siteId,
    currentPath,
    cid,
    ensureSystemFolder,
    systemFolderName,
    systemFolderRootOnly,
    relativePath,
    rootPath,
    pinSystemFolderLast,
    isSystemFolder,
  ]);

  const resolveDropTargetRelativePath = useCallback((dropTarget) => {
    if (dropTarget?.type === 'folder-row') return safeText(dropTarget?.relativePath);
    return safeText(relativePath);
  }, [relativePath]);

  const handleWebDropToDropTarget = useCallback((e, dropTarget) => {
    if (Platform.OS !== 'web') return;
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_e) {}

    // Safe: if SharePoint isn't linked yet, ignore drops without showing a red error banner.
    if (!safeText(siteId)) {
      return;
    }

    const targetRel = resolveDropTargetRelativePath(dropTarget);
    const uploader = uploadEntriesWithPathsRef.current;
    if (typeof uploader !== 'function') {
      // Uploader not ready yet (should be rare, but avoids TDZ / race issues)
      return;
    }

    (async () => {
      try {
        const dt = e?.dataTransfer;
        const entries = await filesFromDataTransfer(dt);
        if (entries.length > 0) {
          await uploader(entries, targetRel);
          return;
        }

        const list = Array.from(dt?.files || []);
        if (list.length > 0) {
          const fileEntries = list.map((file) => ({ file, relativePath: safeText(file?.name) }));
          await uploader(fileEntries, targetRel);
          return;
        }

        setError(
          'Inga filer hittades i droppen. Om du försöker släppa en mapp: använd knappen ”Välj mapp” (rekommenderas), eller prova en webbläsare som stöder mapp-drop (t.ex. Chrome/Edge).',
        );
      } catch (err) {
        setError(String(err?.message || err || 'Kunde inte läsa uppladdningen.'));
      }
    })();
  }, [resolveDropTargetRelativePath, siteId]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!enableWebDnD) return;
    if (typeof document === 'undefined') return;

    const isFileDrag = (evt) => {
      const dt = evt?.dataTransfer;
      if (!dt) return false;

      try {
        const types = Array.from(dt.types || []);
        if (types.includes('Files')) return true;
      } catch (_e) {}

      try {
        const items = Array.from(dt.items || []);
        return items.some((it) => safeText(it?.kind) === 'file');
      } catch (_e) {}

      return false;
    };

    const isInsideTable = (evt) => {
      const root = tableRootRef.current;
      const target = evt?.target;
      if (!root || !target) return false;
      try {
        return root === target || (typeof root.contains === 'function' && root.contains(target));
      } catch (_e) {
        return false;
      }
    };

    const onDocDragOver = (evt) => {
      if (!isFileDrag(evt)) return;
      try {
        evt.preventDefault();
      } catch (_e) {}

      const inside = isInsideTable(evt);
      if (inside) {
        setIsDraggingSafe(true);
      } else {
        // If you leave the app/window (or drag outside the table), make sure we never get stuck.
        resetDragState();
      }
    };

    const onDocDrop = (evt) => {
      if (!isFileDrag(evt)) return;
      try {
        evt.preventDefault();
      } catch (_e) {}

      // Important: don't clear folder-hover state when dropping inside the table,
      // otherwise the drop target can be lost before component onDrop runs.
      if (!isInsideTable(evt)) {
        resetDragState();
        setError('Släpp filerna i tabellen för att ladda upp.');
      }
    };

    document.addEventListener('dragenter', onDocDragOver, true);
    document.addEventListener('dragover', onDocDragOver, true);
    document.addEventListener('drop', onDocDrop, true);

    return () => {
      document.removeEventListener('dragenter', onDocDragOver, true);
      document.removeEventListener('dragover', onDocDragOver, true);
      document.removeEventListener('drop', onDocDrop, true);
    };
  }, [enableWebDnD, resetDragState, setIsDraggingSafe]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!enableWebDnD) return;
    if (typeof window === 'undefined') return;

    const doc = typeof document !== 'undefined' ? document : null;

    const onWinDragEnd = () => {
      resetDragState();
    };

    const onWinDrop = () => {
      resetDragState();
    };

    const onWinBlur = () => {
      resetDragState();
    };

    const onVisibilityChange = () => {
      // If the tab becomes hidden while dragging, make sure we never get stuck.
      try {
        if (doc && doc.hidden) resetDragState();
      } catch (_e) {
        resetDragState();
      }
    };

    window.addEventListener('dragend', onWinDragEnd);
    window.addEventListener('drop', onWinDrop);
    window.addEventListener('blur', onWinBlur);
    if (doc) doc.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('dragend', onWinDragEnd);
      window.removeEventListener('drop', onWinDrop);
      window.removeEventListener('blur', onWinBlur);
      if (doc) doc.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enableWebDnD, resetDragState]);

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



  // Navigating to another folder should clear file preview and return to the calm list-default.
  useEffect(() => {
    if (!enableInlinePreview) return;
    setPreviewModalOpen(false);
    setPreviewEnabled(false);
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

  const existingFolderNamesLower = useMemo(() => {
    const set = new Set();
    (Array.isArray(items) ? items : []).forEach((it) => {
      if (it?.type !== 'folder') return;
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

  const uploadEntriesWithPaths = useCallback(async (entries, targetRelativePath) => {
    const arr = Array.isArray(entries) ? entries : [];
    if (arr.length === 0) return;

    if (!hasContext || !safeText(siteId)) {
      return;
    }

    setError('');

    const normalized = arr
      .map((x) => ({ file: x?.file, relativePath: safeText(x?.relativePath) }))
      .filter((x) => x?.file);

    if (normalized.length === 0) return;

    // Validate types first
    const invalid = normalized.filter((x) => !isAllowedUploadFile(x.file));
    if (invalid.length > 0) {
      const names = invalid.map((x) => safeText(x?.file?.name) || 'fil').slice(0, 8);
      setError(`Otillåten filtyp: ${names.join(', ')}${invalid.length > 8 ? '…' : ''}`);
      return;
    }

    // Build tasks: preserve directory structure.
    const tasks = normalized.map((x) => {
      const rel = sanitizeSharePointRelativePath(x.relativePath || safeText(x?.file?.name));
      const parts = rel.split('/').filter(Boolean);
      const fileNameFromPath = parts.length > 0 ? parts[parts.length - 1] : safeText(x?.file?.name);
      const relDir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      return {
        file: x.file,
        relativeDir: relDir,
        originalName: fileNameFromPath || safeText(x?.file?.name) || `fil_${Date.now()}`,
      };
    });

    const baseRel = safeText(targetRelativePath) !== '' || targetRelativePath === ''
      ? safeText(targetRelativePath)
      : safeText(relativePath);
    const baseAbsPath = joinPath(rootPath, baseRel);
    const seedExistingFiles = baseRel === safeText(relativePath)
      ? existingFileNamesLower
      : [];
    const seedExistingFolders = baseRel === safeText(relativePath)
      ? existingFolderNamesLower
      : [];

    const { batchId, itemIds } = uploadManager.createBatch({
      title: 'SharePoint-uppladdning',
      message: 'Startar…',
      items: tasks.map((t) => ({
        name: safeText(t?.originalName) || safeText(t?.file?.name) || 'Fil',
        total: Number(t?.file?.size || 0) || 0,
      })),
    });

    const failures = [];
    const existingNamesCache = new Map(); // absFolderPath -> Set(lowercase file names)
    const existingFolderNamesCache = new Map(); // absFolderPath -> Set(lowercase folder names)

    // Seed the current folder cache from already loaded list.
    existingNamesCache.set(baseAbsPath, new Set(seedExistingFiles));
    existingFolderNamesCache.set(baseAbsPath, new Set(seedExistingFolders));

    const getExistingNamesForFolder = async (absFolderPath) => {
      const key = safeText(absFolderPath);
      if (existingNamesCache.has(key)) return existingNamesCache.get(key);

      try {
        const list = await getSharePointFolderItems(siteId, `/${key}`);
        const set = new Set();
        (Array.isArray(list) ? list : []).forEach((it) => {
          if (it?.type !== 'file') return;
          const nm = safeText(it?.name);
          if (nm) set.add(nm.toLowerCase());
        });
        existingNamesCache.set(key, set);
        return set;
      } catch (_e) {
        const set = new Set();
        existingNamesCache.set(key, set);
        return set;
      }
    };

    const getExistingFolderNamesForFolder = async (absFolderPath) => {
      const key = safeText(absFolderPath);
      if (existingFolderNamesCache.has(key)) return existingFolderNamesCache.get(key);

      try {
        const list = await getSharePointFolderItems(siteId, `/${key}`);
        const set = new Set();
        (Array.isArray(list) ? list : []).forEach((it) => {
          if (it?.type !== 'folder') return;
          const nm = safeText(it?.name);
          if (nm) set.add(nm.toLowerCase());
        });
        existingFolderNamesCache.set(key, set);
        return set;
      } catch (_e) {
        const set = new Set();
        existingFolderNamesCache.set(key, set);
        return set;
      }
    };

    const folderRemapCache = new Map(); // `${parentAbs}|${origLower}` -> deduped actual name

    const resolveRelativeDirWithDedupe = async (originalRelDir) => {
      const raw = sanitizeSharePointRelativePath(originalRelDir);
      if (!raw) return '';

      const parts = raw.split('/').filter(Boolean).map((seg) => sanitizeSharePointFolderSegment(seg)).filter(Boolean);
      if (parts.length === 0) return '';

      let resolved = '';
      let parentAbs = baseAbsPath;

      for (const seg of parts) {
        const segLower = safeText(seg).toLowerCase();
        const key = `${safeText(parentAbs)}|${segLower}`;

        let actual = folderRemapCache.get(key);
        if (!actual) {
          // Dedupe against existing folder names in this parent folder.
          // eslint-disable-next-line no-await-in-loop
          const existingFolders = await getExistingFolderNamesForFolder(parentAbs);
          actual = dedupeFolderName(seg, existingFolders);
          existingFolders.add(safeText(actual).toLowerCase());
          folderRemapCache.set(key, actual);
        }

        resolved = resolved ? `${resolved}/${actual}` : actual;
        parentAbs = joinPath(baseAbsPath, resolved);
      }

      return resolved;
    };

    try {
      // Ensure base folder exists.
      uploadManager.setBatchMessage(batchId, 'Förbereder mappar…');
      await ensureFolderPath(baseAbsPath, cid, siteId, { siteRole: 'projects', strict: true });

      // Ensure all subfolders exist (depth-first).
      const folderSet = new Set();
      tasks.forEach((t) => {
        const relDir = safeText(t.relativeDir);
        if (!relDir) return;
        folderSet.add(relDir);
      });

      const foldersToEnsureRaw = Array.from(folderSet)
        .map((p) => sanitizeSharePointRelativePath(p))
        .filter(Boolean)
        .sort((a, b) => a.split('/').length - b.split('/').length);

      // Resolve and dedupe folder names per parent folder to avoid collisions.
      const resolvedRelDirMap = new Map();
      for (const relDir of foldersToEnsureRaw) {
        // eslint-disable-next-line no-await-in-loop
        const resolved = await resolveRelativeDirWithDedupe(relDir);
        resolvedRelDirMap.set(relDir, resolved);
      }

      const foldersToEnsure = Array.from(new Set(Array.from(resolvedRelDirMap.values()).filter(Boolean)))
        .sort((a, b) => a.split('/').length - b.split('/').length);

      for (const relDir of foldersToEnsure) {
        uploadManager.setBatchMessage(batchId, `Skapar mapp: ${relDir}`);
        await ensureFolderPath(joinPath(baseAbsPath, relDir), cid, siteId, { siteRole: 'projects', strict: true });
      }

      uploadManager.setBatchMessage(batchId, 'Laddar upp filer…');

      const refreshEvery = 8;
      let uploadedSinceRefresh = 0;

      const worker = async (t, idx) => {
        const itemId = safeText(itemIds?.[idx]);
        const rawRelDir = sanitizeSharePointRelativePath(safeText(t.relativeDir));
        const relDir = rawRelDir ? (resolvedRelDirMap.get(rawRelDir) || rawRelDir) : '';
        const absFolderPath = relDir ? joinPath(baseAbsPath, relDir) : baseAbsPath;

        if (itemId) {
          uploadManager.setItemUploading(batchId, itemId);
        }

        try {
          const existing = await getExistingNamesForFolder(absFolderPath);
          const targetName = dedupeFileName(safeText(t.originalName), existing);
          existing.add(targetName.toLowerCase());

          const path = joinPath(absFolderPath, targetName);

          if (itemId) {
            uploadManager.setItemNameAndPath(batchId, itemId, targetName, path);
          }

          await uploadFile({
            file: t.file,
            path,
            companyId: cid,
            siteId,
            siteRole: 'projects',
            strictEnsure: true,
            onProgress: (p) => {
              if (!itemId) return;
              const total = Number(p?.total || t?.file?.size || 0);
              const loaded = Number(p?.loaded || 0);
              uploadManager.setItemProgress(batchId, itemId, loaded, total || 0);
            },
          });

          if (itemId) {
            const size = Number(t?.file?.size || 0);
            if (size > 0) uploadManager.setItemProgress(batchId, itemId, size, size);
            uploadManager.setItemSuccess(batchId, itemId);
          }

          uploadedSinceRefresh += 1;
          if (uploadedSinceRefresh >= refreshEvery) {
            uploadedSinceRefresh = 0;
            try { await refresh(); } catch (_e) {}
          }
        } catch (e) {
          failures.push({
            name: safeText(t.originalName) || 'fil',
            error: String(e?.message || e || 'Fel vid uppladdning'),
          });

          if (itemId) {
            uploadManager.setItemError(batchId, itemId, e?.message || e);
          }
        } finally {
          // No local progress state; global panel shows status.
        }
      };

      // Controlled parallelism; keep it conservative to avoid throttling.
      await runWithConcurrency(tasks, 2, worker);

      if (failures.length > 0) {
        uploadManager.setBatchMessage(batchId, `Klart (med fel: ${failures.length})`);
      } else {
        uploadManager.setBatchMessage(batchId, 'Klart');
      }
    } finally {
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    }
  }, [uploadManager, hasContext, siteId, rootPath, relativePath, cid, refresh, existingFileNamesLower, onDidMutate]);

  useEffect(() => {
    uploadEntriesWithPathsRef.current = uploadEntriesWithPaths;
  }, [uploadEntriesWithPaths]);

  const uploadFiles = useCallback(async (files) => {
    const arr = Array.isArray(files) ? files : [];
    if (arr.length === 0) return;
    const entries = arr.map((file) => ({ file, relativePath: safeText(file?.name) }));
    await uploadEntriesWithPaths(entries);
  }, [uploadEntriesWithPaths]);

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
      if (ensureSystemFolder && safeText(systemFolderName) && safeText(scopeRootPath) && p === safeText(scopeRootPath)) {
        await ensureFolderPath(joinPath(scopeRootPath, systemFolderName), cid, siteId, { siteRole: 'projects', strict: true });
      }

      const list = await getSharePointFolderItems(siteId, `/${p}`);
      const folders = (Array.isArray(list) ? list : []).filter((x) => x?.type === 'folder');
      folders.sort((a, b) => {
        if (pinSystemFolderLast && safeText(scopeRootPath) && p === safeText(scopeRootPath)) {
          const aSys = normalizeKey(a?.name) === normalizeKey(systemFolderName);
          const bSys = normalizeKey(b?.name) === normalizeKey(systemFolderName);
          if (aSys && !bSys) return 1;
          if (!aSys && bSys) return -1;
        }
        return safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' });
      });
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
    const lockedSys = Boolean(lockSystemFolder && isFolder && isSystemFolder(it));

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
        disabled: lockedSys || !(isFile || isFolder),
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
        disabled: lockedSys || !(isFile || isFolder),
      },
    ];
  }, [menuTarget, lockSystemFolder, isSystemFolder]);

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
      const currentName = safeText(it?.name);
      if (it?.type === 'file') {
        const { base } = splitLockedBaseAndExt(currentName);
        setRenameValue(base || currentName);
      } else {
        setRenameValue(currentName);
      }
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

  const renameLockedExt = useMemo(() => {
    if (!renameTarget || renameTarget?.type !== 'file') return '';
    return fileExtFromName(safeText(renameTarget?.name));
  }, [renameTarget]);

  const performRename = async () => {
    const it = renameTarget;
    if (!it) return;

    const isFile = it?.type === 'file';
    const currentName = safeText(it?.name);
    const { base: baseOrName, nextName } = isFile
      ? buildLockedFileRename({ originalName: currentName, inputBase: renameValue })
      : { base: safeText(renameValue), nextName: safeText(renameValue) };

    if (lockSystemFolder && isSystemFolder(it)) {
      setRenameError('Denna systemmapp kan inte döpas om.');
      return;
    }
    if (!nextName || !safeText(baseOrName)) {
      setRenameError('Ange ett namn.');
      return;
    }
    if (!safeText(siteId)) {
      setRenameError('Saknar SharePoint siteId.');
      return;
    }

    if (safeText(nextName) === currentName) {
      setRenameOpen(false);
      setRenameTarget(null);
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

    if (lockSystemFolder && isSystemFolder(it)) {
      setDeleteError('Denna systemmapp kan inte raderas.');
      return;
    }
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

    if (lockSystemFolder && safeText(systemFolderName) && normalizeKey(name) === normalizeKey(systemFolderName)) {
      Alert.alert('Inte tillåtet', 'Denna systemmapp skapas automatiskt och kan inte skapas manuellt.');
      return;
    }

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
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
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
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
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
    <View style={[styles.container, enableInlinePreview ? styles.containerOverBackground : null]}>
      {/* Hidden file input (web) */}
      {Platform.OS === 'web' ? (
        <>
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

          {/* Folder picker (Chromium/Safari): preserves webkitRelativePath */}
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // Non-standard attributes (supported in Chromium/Safari)
            webkitdirectory=""
            accept={buildAcceptAttr()}
            style={{ display: 'none' }}
            onChange={(e) => {
              const list = Array.from(e?.target?.files || []);
              if (e?.target) e.target.value = '';
              const entries = filesFromFileList(list);
              uploadEntriesWithPaths(entries);
            }}
          />
        </>
      ) : null}

      <View style={enableInlinePreview ? styles.contentCard : null}>

      {siteError && !sharePointNotLinked ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{siteError}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {Array.isArray(breadcrumbParts) && breadcrumbParts.length > 0 ? (
        <View style={styles.breadcrumbRow}>
          <View style={styles.breadcrumbCrumbs}>
            {breadcrumbParts.map((part, idx) => {
              const isLast = idx === breadcrumbParts.length - 1;
              const isActive = safeText(relativePath) === safeText(part.relativePath);
              const canNavigate = !isLast || !isActive;
              const rel = safeText(part.relativePath);
              const isDragOver = Platform.OS === 'web' && rel === safeText(dragOverBreadcrumbRelPath);

              return (
                <View key={`${idx}-${part.label}`} style={styles.breadcrumbPart}>
                  <Pressable
                    onPress={() => {
                      if (!canNavigate) return;
                      setSelectedItemId(null);
                      setRelativePath(part.relativePath || '');
                    }}
                    onDragOver={enableWebDnD ? ((e) => {
                      try {
                        e.preventDefault();
                        e.stopPropagation();
                      } catch (_e) {}
                      setDragOverBreadcrumbRelPath(rel);
                    }) : undefined}
                    onDragLeave={enableWebDnD ? (() => {
                      setDragOverBreadcrumbRelPath('');
                    }) : undefined}
                    onDrop={enableWebDnD ? ((e) => {
                      try {
                        e.preventDefault();
                        e.stopPropagation();
                      } catch (_e) {}
                      setDragOverBreadcrumbRelPath('');

                      (async () => {
                        try {
                          const dt = e?.dataTransfer;
                          const entries = await filesFromDataTransfer(dt);
                          if (entries.length > 0) {
                            await uploadEntriesWithPaths(entries, rel);
                            return;
                          }
                          const list = Array.from(dt?.files || []);
                          if (list.length > 0) {
                            const fileEntries = list.map((file) => ({ file, relativePath: safeText(file?.name) }));
                            await uploadEntriesWithPaths(fileEntries, rel);
                          }
                        } catch (err) {
                          setError(String(err?.message || err || 'Kunde inte läsa uppladdningen.'));
                        }
                      })();
                    }) : undefined}
                    style={({ hovered, pressed }) => ({
                      paddingVertical: 2,
                      paddingHorizontal: 4,
                      borderRadius: 8,
                      backgroundColor: isDragOver
                        ? 'rgba(25, 118, 210, 0.14)'
                        : (hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent'),
                      ...(Platform.OS === 'web' ? { cursor: canNavigate ? 'pointer' : 'default' } : {}),
                    })}
                    {...(Platform.OS === 'web'
                      ? { title: `Ladda upp till ${safeText(part.label) || 'mapp'}` }
                      : {})}
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

          {Platform.OS === 'web' ? (
            <View style={styles.breadcrumbActions}>
              <Pressable
                onPress={() => {
                  setNewFolderName('');
                  setCreateFolderOpen(true);
                }}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'rgba(25, 118, 210, 0.08)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
                accessibilityRole="button"
              >
                <Ionicons name="folder-outline" size={14} color="#1976D2" />
                <Text style={{ color: '#1976D2', fontSize: 12, fontWeight: '600' }}>Ny mapp</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  try { fileInputRef.current?.click?.(); } catch (_e) {}
                }}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'rgba(25, 118, 210, 0.08)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
                accessibilityRole="button"
              >
                <Text style={{ color: '#1976D2', fontSize: 12, fontWeight: '600' }}>Välj filer</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  try { folderInputRef.current?.click?.(); } catch (_e) {}
                }}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'rgba(25, 118, 210, 0.08)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
                accessibilityRole="button"
              >
                <Text style={{ color: '#1976D2', fontSize: 12, fontWeight: '600' }}>Välj mapp</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {enableInlinePreview && previewMode !== 'on-select-only' ? (
        <View style={styles.listToolbarRow}>
          <Pressable
            onPress={() => {
              setPreviewModalOpen(false);
              setPreviewEnabled((v) => {
                const next = !v;
                if (next) {
                  // If a file is selected, open it directly when enabling preview.
                  if (!safeText(previewItemId) && safeText(selectedItemId)) {
                    setPreviewItemId(String(selectedItemId));
                  }
                } else {
                  // Reset state when closing preview.
                  setPreviewItemId(null);
                }
                return next;
              });
            }}
            style={({ hovered, pressed }) => ({
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: isInlinePreviewVisible
                ? (hovered || pressed ? 'rgba(0,0,0,0.04)' : '#fff')
                : (hovered || pressed ? 'rgba(25, 118, 210, 0.92)' : '#1976D2'),
              borderWidth: 1,
              borderColor: isInlinePreviewVisible ? 'rgba(148,163,184,0.6)' : '#1976D2',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            })}
          >
            <Ionicons
              name={isInlinePreviewVisible ? 'close-outline' : 'reader-outline'}
              size={16}
              color={isInlinePreviewVisible ? '#334155' : '#fff'}
            />
            <Text style={[styles.listToolbarButtonText, isInlinePreviewVisible ? styles.listToolbarButtonTextSecondary : null]}>
              {isInlinePreviewVisible ? 'Dölj förhandsvisning' : 'Visa förhandsvisning'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.splitRow, !enableInlinePreview ? styles.splitRowSingle : null]}>
        <View style={[styles.listPane, styles.paneStretch, enableInlinePreview && isWidePreviewLayout ? { flex: 1 } : null]}>
          {sharePointNotLinked ? (
            <Text style={styles.inlineSharePointNotLinked}>
              Uppladdning är inte tillgänglig – SharePoint är inte kopplat ännu
            </Text>
          ) : null}

          {/* Table */}
          <View
            ref={tableRootRef}
            style={[
              styles.table,
              isTableDragActive ? styles.tableDropActive : null,
            ]}
            pointerEvents="auto"
            {...(enableWebDnD
              ? {
                onDragEnter: (e) => {
                  try { e.preventDefault(); } catch (_e) {}
                  tableDragDepthRef.current = Math.max(0, Number(tableDragDepthRef.current || 0)) + 1;
                  setIsDraggingSafe(true);
                },
                onDragOver: (e) => {
                  try { e.preventDefault(); } catch (_e) {}
                  if (!isDraggingRef.current) setIsDraggingSafe(true);
                },
                onDragLeave: (e) => {
                  try { e.preventDefault(); } catch (_e) {}
                  tableDragDepthRef.current = Math.max(0, Number(tableDragDepthRef.current || 0) - 1);
                  if (tableDragDepthRef.current === 0) {
                    resetDragState();
                  }
                },
                onDragEnd: () => {
                  resetDragState();
                },
                onDrop: (e) => {
                  try {
                    e.preventDefault();
                    e.stopPropagation?.();
                  } catch (_e) {}

                  try {
                    const dt = e?.dataTransfer;
                    const filesLen = Number(dt?.files?.length || 0);
                    const itemsLen = Number(dt?.items?.length || 0);

                    // Defensive: nothing to upload -> reset and exit.
                    if ((!dt || filesLen === 0) && itemsLen === 0) {
                      return;
                    }

                    const activeFolder = safeText(activeDropFolderRef.current);

                    if (activeFolder) {
                      handleWebDropToDropTarget(e, { type: 'folder-row', relativePath: activeFolder });
                    } else {
                      handleWebDropToDropTarget(e, { type: 'current-folder' });
                    }
                  } finally {
                    // Required: always reset drag state (even on error).
                    resetDragState();
                  }
                },
              }
              : {})}
          >
            <View
              style={[styles.tableScrollWrap, Platform.OS === 'web' ? { overflowX: 'auto' } : null]}
              pointerEvents="auto"
            >
              <View
                style={[
                  styles.tableInner,
                  Platform.OS === 'web'
                    ? { minWidth: isCompactTable ? 520 : 980 }
                    : null,
                ]}
                pointerEvents="auto"
              >
                <View
                  style={[styles.tableHeader, isTableDragActive ? styles.tableHeaderDimmed : null]}
                  onLayout={(e) => {
                    try {
                      const h = Number(e?.nativeEvent?.layout?.height || 0);
                      if (Number.isFinite(h) && h > 0) setTableHeaderHeight(h);
                    } catch (_e) {}
                  }}
                  {...(Platform.OS === 'web'
                    ? { title: dndTipText }
                    : {})}
                >
                  <Text style={[styles.th, styles.colName]} numberOfLines={1}>Filnamn</Text>
                  <Text style={[styles.th, styles.colType]} numberOfLines={1}>Typ</Text>
                  {!isCompactTable ? (
                    <Text style={[styles.th, styles.colUploadedBy]} numberOfLines={1}>Uppladdad av</Text>
                  ) : null}
                  {!isCompactTable ? (
                    <Text style={[styles.th, styles.colCreated, { width: COL_DATE_W }]} numberOfLines={1}>Skapad</Text>
                  ) : null}
                  {!isCompactTable ? (
                    <Text style={[styles.th, styles.colModified, { width: COL_DATE_W }]} numberOfLines={1}>Senast ändrad</Text>
                  ) : null}
                  <Text style={[styles.th, styles.colMenu, { width: COL_MENU_W }]} numberOfLines={1}>⋮</Text>
                </View>

                {isTableDragActive ? (
                  <View style={[styles.tableDropHint, { top: tableHeaderHeight }]} pointerEvents="none">
                    <View style={styles.tableDropHintPlate}>
                      <Text style={styles.tableDropHintText}>
                        Släpp filer för att ladda upp till aktuell mapp
                      </Text>
                    </View>
                  </View>
                ) : null}

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 12 }}
                  pointerEvents="auto"
                >
              {loading ? (
                <Text style={{ padding: 12, fontSize: 12, color: '#64748b' }}>Laddar…</Text>
              ) : null}

              {!loading && Array.isArray(items) && items.length === 0 ? (
                <View style={styles.tableHelpRow} pointerEvents="none">
                  <View style={[styles.colName, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <Ionicons name="cloud-upload-outline" size={16} color="#94A3B8" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.tableHelpRowTitle} numberOfLines={1}>Inga filer eller mappar ännu.</Text>
                      <Text style={styles.tableHelpRowHint} numberOfLines={1}>{dndTipText}</Text>
                    </View>
                  </View>

                  <View style={styles.colType} />
                  {!isCompactTable ? <View style={styles.colUploadedBy} /> : null}
                  {!isCompactTable ? <View style={[styles.colCreated, { width: COL_DATE_W }]} /> : null}
                  {!isCompactTable ? <View style={[styles.colModified, { width: COL_DATE_W }]} /> : null}
                  <View style={[styles.colMenu, { width: COL_MENU_W }]} />
                </View>
              ) : null}

              {(Array.isArray(items) ? items : []).map((it) => {
            const name = safeText(it?.name) || (it?.type === 'folder' ? 'Mapp' : 'Fil');
            const isFolder = it?.type === 'folder';
            const rowRelPath = isFolder ? joinPath(relativePath, name) : '';
            const isRowDragOver = enableWebDnD && isFolder && safeText(activeDropFolder) === safeText(rowRelPath);

            const isSelected = !isFolder && safeText(it?.id) && safeText(selectedItemId) === safeText(it?.id);
            const isPreviewing = isInlinePreviewVisible && !isFolder && safeText(previewItemId) && safeText(previewItemId) === safeText(it?.id);
            const ext = fileExtFromName(name);
            const typeMeta = isFolder
              ? { label: 'MAPP', icon: 'folder-outline' }
              : classifyFileType(name);

            return (
              <Pressable
                key={safeText(it?.id) || name}
                {...(enableWebDnD && isFolder
                  ? {
                    onDragEnter: (e) => {
                      try { e.preventDefault(); } catch (_e) {}
                      setIsDraggingSafe(true);
                      setActiveDropFolderSafe(rowRelPath);
                    },
                    onDragOver: (e) => {
                      // Required: allow drop
                      try { e.preventDefault(); } catch (_e) {}

                      setIsDraggingSafe(true);
                      if (safeText(activeDropFolderRef.current) !== safeText(rowRelPath)) {
                        setActiveDropFolderSafe(rowRelPath);
                      }
                    },
                    onDragLeave: (e) => {
                      try { e.preventDefault(); } catch (_e) {}

                      // Avoid flicker when moving between child elements inside the same row.
                      try {
                        const current = e?.currentTarget;
                        const related = e?.relatedTarget;
                        if (current && related && typeof current.contains === 'function' && current.contains(related)) {
                          return;
                        }
                      } catch (_e2) {}

                      if (safeText(activeDropFolderRef.current) === safeText(rowRelPath)) {
                        setActiveDropFolderSafe(null);
                      }
                    },
                    onDragEnd: () => {
                      resetDragState();
                    },
                    onDrop: (e) => {
                      try {
                        e.preventDefault();
                        e.stopPropagation?.();
                      } catch (_e) {}

                      try {
                        const dt = e?.dataTransfer;
                        const filesLen = Number(dt?.files?.length || 0);
                        const itemsLen = Number(dt?.items?.length || 0);

                        // Defensive: nothing to upload -> reset and exit.
                        if ((!dt || filesLen === 0) && itemsLen === 0) {
                          return;
                        }

                        handleWebDropToDropTarget(e, { type: 'folder-row', relativePath: rowRelPath });
                      } finally {
                        // Required: always reset drag state (even on error).
                        resetDragState();
                      }
                    },
                  }
                  : {})}
                onPress={() => {
                  if (isFolder) {
                    setSelectedItemId(null);
                    if (enableInlinePreview) {
                      setPreviewModalOpen(false);
                      setPreviewEnabled(false);
                      setPreviewItemId(null);
                    }
                    openFolder(name);
                    return;
                  }
                  const id = safeText(it?.id) || null;
                  setSelectedItemId(id);

                  if (enableInlinePreview) {
                    // Desired UX:
                    // - Single click: open inline preview (auto-enables preview panel).
                    // - Double click (web): open large preview modal.
                    if (Platform.OS === 'web' && id) {
                      const now = Date.now();
                      const prev = lastWebClickRef.current || { id: '', t: 0 };
                      const isDouble = safeText(prev.id) === id && (now - Number(prev.t || 0)) < 380;
                      lastWebClickRef.current = { id, t: now };

                      // In "on-select-only" mode, preview visibility is driven by selected file,
                      // so we must set a preview item id to show the panel.
                      setPreviewItemId(id);
                      if (previewMode !== 'on-select-only') setPreviewEnabled(true);

                      if (isDouble) {
                        setPreviewModalOpen(true);
                      } else {
                        setPreviewModalOpen(false);
                      }
                      return;
                    }

                    setPreviewModalOpen(false);
                    setPreviewItemId(id);
                    if (previewMode !== 'on-select-only') setPreviewEnabled(true);
                    return;
                  }

                  openUrl(it?.webUrl);
                }}
                style={({ hovered, pressed }) => ({
                  position: 'relative',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#EEF2F7',
                  ...(isRowDragOver
                    ? {
                      backgroundColor: 'rgba(25, 118, 210, 0.08)',
                      borderLeftWidth: 3,
                      borderLeftColor: 'rgba(25, 118, 210, 0.55)',
                    }
                    : null),
                  backgroundColor: isPreviewing
                    ? 'rgba(25, 118, 210, 0.12)'
                    : isSelected
                      ? 'rgba(25, 118, 210, 0.06)'
                      : (hovered || pressed ? '#F8FAFC' : '#fff'),
                  borderLeftWidth: isPreviewing ? 3 : 0,
                  borderLeftColor: isPreviewing ? '#1976D2' : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                {Platform.OS === 'web' && isRowDragOver ? (
                  <View style={styles.folderRowDropHint} pointerEvents="none">
                    <Text style={styles.folderRowDropHintText} numberOfLines={1}>
                      Släpp här för att ladda upp i denna mapp
                    </Text>
                  </View>
                ) : null}

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

                {!isCompactTable ? (
                  <Text style={[styles.tdUploader, styles.colUploadedBy]} numberOfLines={1}>
                    {safeText(it?.createdBy) || '—'}
                  </Text>
                ) : null}

                {!isCompactTable ? (
                  <Text style={[styles.td, styles.colCreated, { width: COL_DATE_W }]} numberOfLines={1}>
                    {isFolder ? '—' : toIsoDateText(it?.createdDate)}
                  </Text>
                ) : null}

                {!isCompactTable ? (
                  <Text style={[styles.td, styles.colModified, { width: COL_DATE_W }]} numberOfLines={1}>
                    {toIsoDateText(it?.lastModified)}
                  </Text>
                ) : null}

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
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
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
          </View>
        </View>

        {isInlinePreviewVisible ? (
          <View style={[styles.previewPane, styles.paneStretch, styles.previewPaneAligned, isWidePreviewLayout ? null : styles.previewPaneStacked]}>
            {previewItem ? (
              <SharePointFilePreviewPane
                key={safeText(previewItem?.id) || 'preview'}
                item={previewItem}
                variant="panel"
                siteId={siteId}
                onClose={() => {
                  setPreviewModalOpen(false);
                  setPreviewItemId(null);
                  if (previewMode !== 'on-select-only') {
                    setPreviewEnabled(false);
                  } else {
                    // In focused FFU mode: closing preview means no file is selected.
                    setSelectedItemId(null);
                  }
                }}
                onOpenInModal={() => {
                  if (!previewItem) return;
                  if (Platform.OS !== 'web') return;
                  setPreviewModalOpen(true);
                }}
                onOpenInNewTab={(url) => openUrl(url)}
              />
            ) : (previewMode === 'on-select-only' ? null : (
              <View style={styles.previewPlaceholder}>
                <View style={styles.previewPlaceholderHeader}>
                  <Text style={styles.previewPlaceholderTitle} numberOfLines={1}>Förhandsvisning</Text>
                </View>
                <View style={styles.previewPlaceholderBody}>
                  <Ionicons name="document-outline" size={22} color="#94A3B8" />
                  <Text style={styles.previewPlaceholderMuted}>Välj en fil för att förhandsvisa</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      </View>

      {isInlinePreviewVisible && Platform.OS === 'web' ? (
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
        description={(() => {
          if (!renameTarget) return '';
          const targetName = safeText(renameTarget?.name) || 'objekt';
          if (renameTarget?.type === 'file' && safeText(renameLockedExt)) {
            return `Byter namn på "${targetName}". Filändelsen .${safeText(renameLockedExt)} behålls.`;
          }
          return `Byter namn på "${targetName}".`;
        })()}
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

        {renameTarget?.type === 'file' && safeText(renameLockedExt) ? (
          <>
            <View style={styles.renameRow}>
              <TextInput
                value={renameValue}
                onChangeText={(t) => setRenameValue(normalizeLockedRenameBase(t, renameLockedExt))}
                placeholder="Nytt filnamn"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.renameBaseInput]}
                autoFocus
                onSubmitEditing={() => {
                  if (renameTarget && safeText(renameValue)) performRename();
                }}
                returnKeyType="done"
              />
              <View style={styles.renameExtPill}>
                <Text style={styles.renameExtText} numberOfLines={1}>{`.${safeText(renameLockedExt)}`}</Text>
              </View>
            </View>
            <Text style={styles.renameHint}>
              Filändelsen är låst för att inte ändra filtyp.
            </Text>
          </>
        ) : (
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
        )}
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

  containerOverBackground: {
    backgroundColor: 'transparent',
  },

  contentCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.9)',
    padding: 16,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
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

  tableDropActive: {
    borderColor: 'rgba(25, 118, 210, 0.75)',
    backgroundColor: 'rgba(25, 118, 210, 0.03)',
    // RN-web only (safe no-op elsewhere)
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: 'rgba(25, 118, 210, 0.35)',
  },

  inlineSharePointNotLinked: {
    marginTop: 12,
    marginBottom: -4,
    fontSize: 12,
    color: '#64748b',
  },

  tableDropHint: {
    position: 'absolute',
    top: 6,
    left: 12,
    right: 12,
    zIndex: 2,
    alignItems: 'center',
  },

  tableDropHintText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(25, 118, 210, 0.95)',
    backgroundColor: 'rgba(25, 118, 210, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(25, 118, 210, 0.22)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },

  folderRowDropHint: {
    position: 'absolute',
    right: 10,
    top: 8,
    zIndex: 2,
    maxWidth: 260,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(25, 118, 210, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(25, 118, 210, 0.22)',
  },

  folderRowDropHintText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(25, 118, 210, 0.95)',
  },

  tableScrollWrap: {
    flex: 1,
    minHeight: 0,
  },

  tableInner: {
    flex: 1,
    minHeight: 0,
  },

  listToolbarRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
  },

  listToolbarButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  listToolbarButtonTextSecondary: {
    color: '#334155',
  },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 2,
    borderBottomColor: '#E2E8F0',
  },

  tableHeaderDimmed: {
    opacity: 0.68,
  },

  tableHelpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    backgroundColor: '#fff',
  },

  tableHelpRowTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },

  tableHelpRowHint: {
    fontSize: 11,
    color: '#94A3B8',
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

  tableDropHintPlate: {
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web'
      ? {
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.10)',
        backdropFilter: 'blur(6px)',
      }
      : {}),
  },

  colUploadedBy: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 110,
    maxWidth: 220,
  },
  colCreated: {
    flexShrink: 0,
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
    fontWeight: '600',
    color: '#334155',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
  },
  breadcrumbCrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  breadcrumbActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  paneStretch: {
    alignSelf: 'stretch',
  },
  previewPane: {
    width: Platform.OS === 'web' ? 720 : '100%',
    minHeight: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
  },

  previewPaneAligned: {
    marginTop: 12,
  },
  previewPaneStacked: {
    width: '100%',
    height: 420,
  },

  previewPlaceholder: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  previewPlaceholderHeader: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  previewPlaceholderTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
  },
  previewPlaceholderBody: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
    backgroundColor: '#fff',
  },
  previewPlaceholderMuted: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
    textAlign: 'center',
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
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },

  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  renameBaseInput: {
    flex: 1,
    minWidth: 0,
  },

  renameExtPill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },

  renameExtText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },

  renameHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '400',
  },
});
