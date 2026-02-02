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
import SharePointFilePreviewPane from './SharePointFilePreviewPane';
import { ALLOWED_UPLOAD_EXTENSIONS, classifyFileType, dedupeFileName, fileExtFromName, isAllowedUploadFile, safeText } from './sharePointFileUtils';

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

  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const lastWebClickRef = useRef({ id: '', t: 0 });

  const [uploadState, setUploadState] = useState({ busy: false, total: 0, done: 0, current: '', errors: 0 });
  const uploadBusy = Boolean(uploadState?.busy);

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

  const uploadEntriesWithPaths = useCallback(async (entries) => {
    const arr = Array.isArray(entries) ? entries : [];
    if (arr.length === 0) return;

    if (uploadBusy) {
      Alert.alert('Uppladdning pågår', 'Vänta tills uppladdningen är klar innan du startar en ny.');
      return;
    }

    if (!hasContext || !safeText(siteId)) {
      setError('Saknar SharePoint-koppling (siteId).');
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

    setUploadState({ busy: true, total: tasks.length, done: 0, current: '', errors: 0 });

    const failures = [];
    const existingNamesCache = new Map(); // absFolderPath -> Set(lowercase names)

    // Seed the current folder cache from already loaded list.
    existingNamesCache.set(currentPath, new Set(existingFileNamesLower));

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

    try {
      // Ensure base folder exists.
      await ensureFolderPath(currentPath, cid, siteId, { siteRole: 'projects', strict: true });

      // Ensure all subfolders exist (depth-first).
      const folderSet = new Set();
      tasks.forEach((t) => {
        const relDir = safeText(t.relativeDir);
        if (!relDir) return;
        folderSet.add(relDir);
      });

      const foldersToEnsure = Array.from(folderSet)
        .map((p) => sanitizeSharePointRelativePath(p))
        .filter(Boolean)
        .sort((a, b) => a.split('/').length - b.split('/').length);

      for (const relDir of foldersToEnsure) {
        await ensureFolderPath(joinPath(currentPath, relDir), cid, siteId, { siteRole: 'projects', strict: true });
      }

      const refreshEvery = 8;
      let uploadedSinceRefresh = 0;

      const worker = async (t) => {
        const relDir = safeText(t.relativeDir);
        const absFolderPath = relDir ? joinPath(currentPath, relDir) : currentPath;

        setUploadState((prev) => ({
          ...prev,
          current: relDir ? `${relDir}/${safeText(t.originalName)}` : safeText(t.originalName),
        }));

        try {
          const existing = await getExistingNamesForFolder(absFolderPath);
          const targetName = dedupeFileName(safeText(t.originalName), existing);
          existing.add(targetName.toLowerCase());

          const path = joinPath(absFolderPath, targetName);

          await uploadFile({
            file: t.file,
            path,
            companyId: cid,
            siteId,
            siteRole: 'projects',
            strictEnsure: true,
          });

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
          setUploadState((prev) => ({ ...prev, errors: Number(prev?.errors || 0) + 1 }));
        } finally {
          setUploadState((prev) => ({ ...prev, done: Number(prev?.done || 0) + 1 }));
        }
      };

      // Controlled parallelism; keep it conservative to avoid throttling.
      await runWithConcurrency(tasks, 2, worker);

      if (failures.length > 0) {
        const preview = failures.slice(0, 3).map((f) => `${safeText(f.name)} (${safeText(f.error)})`).join(' · ');
        setError(`Kunde inte ladda upp ${failures.length} fil(er). ${preview}${failures.length > 3 ? ' …' : ''}`);
      }
    } finally {
      setUploadState((prev) => ({ ...prev, busy: false, current: '' }));
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    }
  }, [uploadBusy, hasContext, siteId, currentPath, cid, refresh, existingFileNamesLower, onDidMutate]);

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
    if (uploadBusy) {
      Alert.alert('Uppladdning pågår', 'Vänta tills uppladdningen är klar innan du byter mapp.');
      return;
    }
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
          if (uploadBusy) return;
          // Prefer folder picker on click; keep file picker available via the button.
          try { folderInputRef.current?.click?.(); } catch (_e) { try { fileInputRef.current?.click?.(); } catch (_e2) {} }
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

          if (uploadBusy) return;

          (async () => {
            try {
              const dt = e?.dataTransfer;
              const entries = await filesFromDataTransfer(dt);
              if (entries.length > 0) {
                await uploadEntriesWithPaths(entries);
                return;
              }
              const list = Array.from(dt?.files || []);
              await uploadFiles(list);
            } catch (err) {
              setError(String(err?.message || err || 'Kunde inte läsa uppladdningen.'));
            }
          })();
        }}
      >
        <Ionicons
          name="cloud-upload-outline"
          size={22}
          color={dragOver ? '#1976D2' : '#1976D2'}
          style={{ marginRight: 12 }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.dropZoneText, dragOver ? styles.dropZoneTextActive : null]} numberOfLines={2}>
            Dra och släpp filer eller mappar här, eller klicka för att ladda upp
          </Text>
          <Text style={[styles.dropZoneHint, !isListEmpty ? styles.dropZoneHintSubtle : null]} numberOfLines={1}>
            Tillåtna filer: PDF, Word, Excel, DWG, IFC, bilder, ZIP
          </Text>

          {uploadBusy ? (
            <Text style={[styles.dropZoneHint, { marginTop: 6 }]} numberOfLines={2}>
              Laddar upp {Number(uploadState?.done || 0)}/{Number(uploadState?.total || 0)}
              {safeText(uploadState?.current) ? ` · ${safeText(uploadState?.current)}` : ''}
            </Text>
          ) : null}
        </View>

        {Platform.OS !== 'web' ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={(ev) => {
                try { ev?.stopPropagation?.(); } catch (_e) {}
                if (uploadBusy) return;
                try { fileInputRef.current?.click?.(); } catch (_e) {}
              }}
              style={({ hovered, pressed }) => ({
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 10,
                backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'rgba(25, 118, 210, 0.08)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
                opacity: uploadBusy ? 0.6 : 1,
              })}
            >
              <Text style={{ color: '#1976D2', fontSize: 12, fontWeight: '600' }}>Välj filer</Text>
            </Pressable>
            <Pressable
              onPress={(ev) => {
                try { ev?.stopPropagation?.(); } catch (_e) {}
                if (uploadBusy) return;
                try { folderInputRef.current?.click?.(); } catch (_e) {}
              }}
              style={({ hovered, pressed }) => ({
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 10,
                backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'rgba(25, 118, 210, 0.08)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
                opacity: uploadBusy ? 0.6 : 1,
              })}
            >
              <Text style={{ color: '#1976D2', fontSize: 12, fontWeight: '600' }}>Välj mapp</Text>
            </Pressable>
          </View>
        )}
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
                  disabled={!canNavigate || uploadBusy}
                  onPress={() => {
                    if (uploadBusy) {
                      Alert.alert('Uppladdning pågår', 'Vänta tills uppladdningen är klar innan du byter mapp.');
                      return;
                    }
                    setSelectedItemId(null);
                    setRelativePath(part.relativePath || '');
                  }}
                  style={({ hovered, pressed }) => ({
                    paddingVertical: 2,
                    paddingHorizontal: 4,
                    borderRadius: 8,
                    backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: canNavigate && !uploadBusy ? 'pointer' : 'default' } : null),
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
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
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
          {/* Table */}
          <View style={styles.table}>
            <View style={[styles.tableScrollWrap, Platform.OS === 'web' ? { overflowX: 'auto' } : null]}>
              <View
                style={[
                  styles.tableInner,
                  Platform.OS === 'web'
                    ? { minWidth: isCompactTable ? 520 : 980 }
                    : null,
                ]}
              >
                <View style={styles.tableHeader}>
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
            const isPreviewing = isInlinePreviewVisible && !isFolder && safeText(previewItemId) && safeText(previewItemId) === safeText(it?.id);
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
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#EEF2F7',
                  backgroundColor: isPreviewing
                    ? 'rgba(25, 118, 210, 0.12)'
                    : isSelected
                      ? 'rgba(25, 118, 210, 0.06)'
                      : (hovered || pressed ? '#F8FAFC' : '#fff'),
                  borderLeftWidth: isPreviewing ? 3 : 0,
                  borderLeftColor: isPreviewing ? '#1976D2' : 'transparent',
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

  dropZone: {
    marginTop: 2,
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(25, 118, 210, 0.45)',
    backgroundColor: 'rgba(25, 118, 210, 0.06)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  dropZoneHover: {
    backgroundColor: 'rgba(25, 118, 210, 0.08)',
  },

  dropZoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },

  dropZoneTextActive: {
    color: '#1976D2',
  },

  dropZoneHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#334155',
    fontWeight: '400',
  },

  dropZoneHintSubtle: {
    color: '#334155',
    opacity: 0.9,
  },

  dropZoneSubtle: {
    borderColor: 'rgba(25, 118, 210, 0.30)',
  },

  dropZoneEmpty: {
    backgroundColor: 'rgba(25, 118, 210, 0.06)',
    borderColor: 'rgba(25, 118, 210, 0.45)',
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
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
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
