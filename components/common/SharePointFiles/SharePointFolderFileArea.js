import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ensureFolderPath, uploadFile } from '../../../services/azure/fileService';
import { createEmptyDocxBlob, createEmptyXlsxBlob } from '../../../utils/createEmptyOfficeFile';
import { deleteDriveItemById, getDriveItemByPath, moveDriveItemById, renameDriveItemById } from '../../../services/azure/hierarchyService';
import { getSiteByUrl } from '../../../services/azure/siteService';
import { getSharePointFolderItems } from '../../../services/sharepoint/sharePointStructureService';
import { buildLockedFileRename, normalizeLockedRenameBase, splitBaseAndExt as splitLockedBaseAndExt } from '../../../utils/lockedFileRename';
import { filesFromDataTransfer, filesFromFileList } from '../../../utils/webDirectoryFiles';
import ContextMenu from '../../ContextMenu';
import { subscribeProjectFileComments } from '../../firebase';
import FileActionModal from '../Modals/FileActionModal';
import FilePreviewModal from '../Modals/FilePreviewModal';
import { useUploadManager } from '../uploads/UploadManagerContext';
import SharePointFilePreviewPane from './SharePointFilePreviewPane';
import { useFileSelection } from '../../../hooks/useFileSelection';
import { useInlineRename } from '../../../hooks/useInlineRename';
import { ICON_RAIL } from '../../../constants/iconRailTheme';
import { ALLOWED_UPLOAD_EXTENSIONS, classifyFileType, dedupeFileName, dedupeFolderName, fileExtFromName, isAllowedUploadFile, safeText } from './sharePointFileUtils';
import FileExplorerBreadcrumb from './FileExplorerBreadcrumb';
import MoveFilesModal from './MoveFilesModal';

const DND_MOVE_TYPE = 'application/x-digitalkontroll-move';

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

  // Optional: hide specific folders by name (case-insensitive).
  hiddenFolderNames = null,

  // FFU layout: file exploration area fills space, drag-and-drop zone fixed at bottom (near rail).
  bottomDropZone = false,

  // When false, hides the "Skapa" dropdown (Ny mapp, Word, Excel). Used when section root
  // uses lower topbar for folder tabs – create folders there, not in explorer.
  showCreateFolderButton = true,

  // När vi visar en custom mapp (t.ex. lower topbar-flik): klicka på första breadcrumb-segmentet
  // (Förfrågningsunderlag) ska navigera tillbaka till sektionsroten.
  onBreadcrumbNavigateToSection = null,

  // false = skapa inte mapp vid laddning; endast när användare laddar upp fil, skapar undermapp eller släpper fil.
  // Gäller alla sektioner – mapp skapas först vid faktisk användning.
  ensureFolderOnLoad = false,
}) {
  // Keep "Senast ändrad" anchored to the right, while letting other columns share space closer to Filnamn.
  const COL_DATE_W = 140;
  const COL_MENU_W = 46;
  const COL_SELECT_W = 34;

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

  const hiddenFolderKeySet = useMemo(() => {
    const raw = Array.isArray(hiddenFolderNames) ? hiddenFolderNames : [];
    const keys = raw.map((name) => normalizeKey(name)).filter(Boolean);
    return new Set(keys);
  }, [hiddenFolderNames]);

  const isSystemFolder = useCallback((it) => {
    if (!it || it?.type !== 'folder') return false;
    const sys = normalizeKey(systemFolderName);
    if (!sys) return false;
    if (systemFolderRootOnly && safeText(relativePath) !== '') return false;
    return normalizeKey(it?.name) === sys;
  }, [systemFolderName, systemFolderRootOnly, relativePath]);

  const isWithinSystemFolder = useMemo(() => {
    if (!lockSystemFolder || !safeText(systemFolderName)) return false;
    const sys = normalizeKey(systemFolderName);
    const rel = normalizeKey(relativePath);
    if (!sys || !rel) return false;
    if (systemFolderRootOnly && rel !== sys) return false;
    return rel === sys || rel.startsWith(`${sys}/`);
  }, [lockSystemFolder, systemFolderName, relativePath, systemFolderRootOnly]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  const [previewItemId, setPreviewItemId] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // UX: "active/open" is purely derived from the preview modal being open.
  // Closing the preview must always clear the active state so that a "last opened" file
  // does not remain visually marked when no preview is active.
  const closePreview = useCallback(() => {
    setPreviewModalOpen(false);
    setPreviewItemId(null);
  }, []);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewNumPages, setPreviewNumPages] = useState(null);
  const [fileCommentCount, setFileCommentCount] = useState({});

  // Web drag/drop state (single source of truth)
  const [isDragging, setIsDragging] = useState(false);
  const [activeDropFolder, setActiveDropFolder] = useState(null); // relativePath | null
  const [draggingIds, setDraggingIds] = useState([]); // ids being dragged (for opacity)
  const [tableHeaderHeight, setTableHeaderHeight] = useState(44);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const tableDragDepthRef = useRef(0);
  const tableRootRef = useRef(null);
  const isDraggingRef = useRef(false);
  const activeDropFolderRef = useRef('');
  const uploadEntriesWithPathsRef = useRef(null);
  const handleWebDropToDropTargetRef = useRef(null);
  const moveItemsToFolderRef = useRef(null);

  const uploadManager = useUploadManager();
  const [dragOverBreadcrumbRelPath, setDragOverBreadcrumbRelPath] = useState('');

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 20, y: 64 });
  const [menuTarget, setMenuTarget] = useState(null);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createOfficeFileOpen, setCreateOfficeFileOpen] = useState(false);
  const [createOfficeFileType, setCreateOfficeFileType] = useState('docx');
  const [newOfficeFileName, setNewOfficeFileName] = useState('');
  const [createDropdownOpen, setCreateDropdownOpen] = useState(false);
  const createDropdownRef = useRef(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteTargets, setDeleteTargets] = useState([]); // bulk: flera objekt att radera
  const [deleteError, setDeleteError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'type' | 'modified'
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'

  const [colWidths, setColWidths] = useState({});
  const resizeRef = useRef({ col: null, startX: 0, startW: 0 });
  const COL_RESIZE_DEFAULTS = { name: 280, type: 107, uploadedBy: 165, modified: 140 };
  const COL_RESIZE_MIN = { name: 120, type: 74, uploadedBy: 80, modified: 100 };
  const COL_RESIZE_MAX = { name: 600, type: 200, uploadedBy: 300, modified: 220 };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMove = (e) => {
      const { col, startX, startW } = resizeRef.current;
      if (!col) return;
      const delta = e.clientX - startX;
      const min = COL_RESIZE_MIN[col] ?? 80;
      const max = COL_RESIZE_MAX[col] ?? 300;
      const next = Math.max(min, Math.min(max, startW + delta));
      setColWidths((w) => ({ ...w, [col]: next }));
    };
    const onUp = () => {
      resizeRef.current = { col: null, startX: 0, startW: 0 };
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [colWidths]);
  const startResize = useCallback((col, e) => {
    if (Platform.OS !== 'web') return;
    try { e?.stopPropagation?.(); e?.preventDefault?.(); } catch (_) {}
    const def = COL_RESIZE_DEFAULTS[col] ?? 140;
    resizeRef.current = { col, startX: e?.nativeEvent?.clientX ?? 0, startW: colWidths[col] ?? def };
  }, [colWidths]);

  const colStyle = useCallback((key) => {
    const w = colWidths[key];
    const base = key === 'name' ? styles.colName : key === 'type' ? styles.colType : key === 'uploadedBy' ? styles.colUploadedBy : styles.colModified;
    const extra = w != null ? { width: w, flexGrow: 0, flexShrink: 0 } : (key === 'modified' ? { width: COL_DATE_W } : {});
    return [base, extra];
  }, [colWidths]);

  const ResizeHandle = useCallback(({ col }) => {
    if (Platform.OS !== 'web') return null;
    return (
      <View
        onMouseDown={(e) => startResize(col, e)}
        style={styles.resizeHandle}
        accessibilityRole="none"
      />
    );
  }, [startResize]);

  const displayedItems = useMemo(() => {
    const raw = Array.isArray(items) ? items : [];
    let filtered = raw;
    const q = safeText(searchQuery).toLowerCase();
    if (q) {
      filtered = raw.filter((it) => {
        const name = safeText(it?.name).toLowerCase();
        const typeLabel = it?.type === 'folder' ? 'mapp' : (classifyFileType(it?.name)?.label || '').toLowerCase();
        return name.includes(q) || typeLabel.includes(q);
      });
    }
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        return dir * safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' });
      }
      if (sortBy === 'type') {
        const ta = a?.type === 'folder' ? 'mapp' : (classifyFileType(a?.name)?.label || '').toLowerCase();
        const tb = b?.type === 'folder' ? 'mapp' : (classifyFileType(b?.name)?.label || '').toLowerCase();
        const cmp = ta.localeCompare(tb, 'sv');
        if (cmp !== 0) return dir * cmp;
        return dir * safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' });
      }
      if (sortBy === 'modified') {
        const da = new Date(a?.lastModified || 0).getTime();
        const db = new Date(b?.lastModified || 0).getTime();
        if (da !== db) return dir * (da - db);
        return dir * safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' });
      }
      return 0;
    });
  }, [items, searchQuery, sortBy, sortDir]);

  const toggleSort = useCallback((col) => {
    setSortBy((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return col;
      }
      setSortDir('asc');
      return col;
    });
  }, []);

  // Urval med Cmd/Ctrl+click och Shift+range (useFileSelection)
  const {
    selectedIds,
    selectedItems,
    selectableItems,
    isIdSelected,
    toggleSelection,
    selectAll,
    clearSelection,
    handleRowClick,
    allSelected,
    someSelected,
  } = useFileSelection({
    items: displayedItems,
    selectableFilter: (it) => !(it?.type === 'folder' && lockSystemFolder && isSystemFolder(it)),
  });

  // Toast för flytt-feedback
  const toastTimeoutRef = useRef(null);
  const [toast, setToast] = useState({ visible: false, message: '' });
  const showToast = useCallback((message, timeoutMs = 3200) => {
    try {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
      setToast({ visible: true, message: String(message || '') });
      toastTimeoutRef.current = setTimeout(() => {
        setToast({ visible: false, message: '' });
        toastTimeoutRef.current = null;
      }, Math.max(800, Number(timeoutMs) || 3200));
    } catch (_e) {}
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      } catch (_e) {}
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!hasContext) return;
    if (!safeText(siteId)) return;

    setLoading(true);
    setError('');

    try {
      if (ensureFolderOnLoad) {
        await ensureFolderPath(currentPath, cid, siteId, { siteRole: 'projects', strict: true });

        if (ensureSystemFolder && safeText(systemFolderName) && (!systemFolderRootOnly || safeText(relativePath) === '')) {
          await ensureFolderPath(joinPath(rootPath, systemFolderName), cid, siteId, { siteRole: 'projects', strict: true });
        }
      }

      const next = await getSharePointFolderItems(siteId, `/${currentPath}`);

      const folders = (Array.isArray(next) ? next : [])
        .filter((x) => x?.type === 'folder')
        .filter((x) => {
          if (!hiddenFolderKeySet || hiddenFolderKeySet.size === 0) return true;
          return !hiddenFolderKeySet.has(normalizeKey(x?.name));
        });
      const files = (Array.isArray(next) ? next : []).filter((x) => x?.type === 'file');

      const systemFolderItems = (pinSystemFolderLast || lockSystemFolder) ? folders.filter((f) => isSystemFolder(f)) : [];
      const otherFolders = (pinSystemFolderLast || lockSystemFolder) ? folders.filter((f) => !isSystemFolder(f)) : folders;

      otherFolders.sort((a, b) =>
        safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' })
      );
      files.sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' }));

      setItems([...otherFolders, ...files, ...systemFolderItems]);
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
    ensureFolderOnLoad,
    ensureSystemFolder,
    systemFolderName,
    systemFolderRootOnly,
    relativePath,
    rootPath,
    pinSystemFolderLast,
    lockSystemFolder,
    isSystemFolder,
    hiddenFolderKeySet,
  ]);

  // Inline rename (dubbelklick)
  const existingNamesForRename = useMemo(() => {
    return new Set((Array.isArray(items) ? items : []).map((it) => safeText(it?.name)).filter(Boolean));
  }, [items]);
  const performRenameItem = useCallback(async (item, newName) => {
    if (!item?.id || !safeText(siteId)) throw new Error('Saknar data.');
    const isFile = item?.type === 'file';
    const currentName = safeText(item?.name);
    const lockedExt = isFile ? fileExtFromName(currentName) : '';
    const { nextName } = isFile && lockedExt
      ? buildLockedFileRename({ originalName: currentName, inputBase: newName })
      : { nextName: safeText(newName) };
    if (!nextName) throw new Error('Ange ett namn.');
    if (lockSystemFolder && isSystemFolder(item)) throw new Error('Denna systemmapp kan inte döpas om.');
    if (nextName === currentName) return;
    await renameDriveItemById(siteId, item.id, nextName);
    await refresh();
    if (typeof onDidMutate === 'function') onDidMutate();
  }, [siteId, refresh, onDidMutate, lockSystemFolder, isSystemFolder]);
  const {
    editingId,
    editValue,
    setEditValue,
    isSaving: renameSaving,
    error: inlineRenameError,
    inputRef: inlineRenameInputRef,
    startEdit,
    commitEdit,
    cancelEdit,
    handleKeyDown: handleInlineRenameKeyDown,
    isEditing,
  } = useInlineRename({
    onRename: performRenameItem,
    existingNames: existingNamesForRename,
  });

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveTargets, setMoveTargets] = useState([]); // bulk: flera objekt att flytta
  const [moveSelectedPath, setMoveSelectedPath] = useState('');
  const [folderChildrenByPath, setFolderChildrenByPath] = useState({}); // path -> [{id,name,type}]
  const [folderExpanded, setFolderExpanded] = useState({});
  const [folderLoading, setFolderLoading] = useState({});
  const [moveError, setMoveError] = useState('');

  const dndTipText = 'Du kan dra och släppa filer och mappar direkt i listan';
  const enableWebDnD = Platform.OS === 'web';

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
    setDraggingIds([]);
  }, [setIsDraggingSafe, setActiveDropFolderSafe]);

  const isTableDragActive = Platform.OS === 'web' && enableWebDnD && isDragging && !safeText(activeDropFolder);

  // Listan ska visa metadata (på web).
  const showListMetadataColumns = Platform.OS === 'web';
  const isCompactTable = !showListMetadataColumns;

  const previewItem = useMemo(() => {
    const id = safeText(previewItemId);
    if (!id) return null;
    return (Array.isArray(items) ? items : []).find((x) => x?.type === 'file' && safeText(x?.id) === id) || null;
  }, [items, previewItemId]);

  // Treat "preview open" as the single source of truth for active/open row state.
  const previewOpen = Platform.OS === 'web' && Boolean(previewModalOpen && previewItem);

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
    // Låsta systemmappen (t.ex. AI-sammanställning) ska inte acceptera drop – varken när vi släpper på mappen eller när vi är inne i den.
    if (lockSystemFolder && safeText(systemFolderName)) {
      if (normalizeKey(targetRel) === normalizeKey(systemFolderName)) {
        setError('Denna mapp är låst. Du kan inte lägga filer här – den används för AI-genererat innehåll.');
        return;
      }
      if (normalizeKey(relativePath) === normalizeKey(systemFolderName)) {
        setError('Denna mapp är låst. Du kan inte lägga filer här – den används för AI-genererat innehåll.');
        return;
      }
    }
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
  }, [resolveDropTargetRelativePath, siteId, lockSystemFolder, systemFolderName, relativePath]);

  useEffect(() => {
    handleWebDropToDropTargetRef.current = handleWebDropToDropTarget;
  }, [handleWebDropToDropTarget]);

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

    const isOurMoveDrag = (evt) => {
      try {
        const types = Array.from(evt?.dataTransfer?.types || []);
        return types.includes(DND_MOVE_TYPE);
      } catch (_e) {
        return false;
      }
    };

    const onDocDragOver = (evt) => {
      const isFile = isFileDrag(evt);
      const isMove = isOurMoveDrag(evt);
      if (!isFile && !isMove) return;
      try {
        evt.preventDefault();
      } catch (_e) {}

      const inside = isInsideTable(evt);
      if (inside) {
        setIsDraggingSafe(true);
        if (isFile || isMove) {
          let dropRelPath = null;
          try {
            let el = evt.target;
            while (el) {
              const path = el.getAttribute?.('data-droppath') ?? el.getAttribute?.('data-drop-path');
              if (path != null && String(path).trim() !== '') {
                dropRelPath = String(path).trim();
                break;
              }
              el = el?.parentElement;
            }
          } catch (_e2) {}
          setActiveDropFolderSafe(dropRelPath);
        }
      } else {
        resetDragState();
      }
    };

    const onDocDrop = (evt) => {
      try {
        evt.preventDefault();
      } catch (_e) {}

      if (!isInsideTable(evt)) {
        resetDragState();
        if (isFileDrag(evt)) setError('Släpp filerna i tabellen för att ladda upp.');
        return;
      }

      try {
        evt.stopPropagation();
      } catch (_e2) {}

      const dt = evt?.dataTransfer;
      const moveData = dt?.getData?.(DND_MOVE_TYPE);
      if (moveData) {
        let dropRelPath = null;
        try {
          let el = evt.target;
          while (el) {
            const path = el.getAttribute?.('data-droppath') ?? el.getAttribute?.('data-drop-path');
            if (path != null && String(path).trim() !== '') {
              dropRelPath = String(path).trim();
              break;
            }
            el = el?.parentElement;
          }
        } catch (_e3) {}
        const targetRel = dropRelPath || relativePath;
        const moveFn = moveItemsToFolderRef.current;
        if (typeof moveFn === 'function') {
          try {
            const payload = JSON.parse(moveData);
            const ids = Array.isArray(payload?.ids) ? payload.ids : [];
            if (ids.length > 0 && targetRel !== null && targetRel !== undefined) {
              moveFn(ids, targetRel);
            }
          } catch (_e4) {}
        }
        resetDragState();
        return;
      }

      if (!isFileDrag(evt)) {
        resetDragState();
        return;
      }

      let dropRelPath = null;
      try {
        let el = evt.target;
        while (el) {
          const path = el.getAttribute?.('data-droppath') ?? el.getAttribute?.('data-drop-path');
          if (path != null && String(path).trim() !== '') {
            dropRelPath = String(path).trim();
            break;
          }
          el = el?.parentElement;
        }
      } catch (_e3) {}
      const handler = handleWebDropToDropTargetRef.current;
      if (typeof handler === 'function') {
        handler(evt, dropRelPath ? { type: 'folder-row', relativePath: dropRelPath } : { type: 'current-folder' });
      }
      resetDragState();
    };

    document.addEventListener('dragenter', onDocDragOver, true);
    document.addEventListener('dragover', onDocDragOver, true);
    document.addEventListener('drop', onDocDrop, true);

    return () => {
      document.removeEventListener('dragenter', onDocDragOver, true);
      document.removeEventListener('dragover', onDocDragOver, true);
      document.removeEventListener('drop', onDocDrop, true);
    };
  }, [enableWebDnD, resetDragState, setIsDraggingSafe, setActiveDropFolderSafe, relativePath]);

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
    if (!createDropdownOpen || Platform.OS !== 'web') return;
    const onPointerDown = (e) => {
      const el = createDropdownRef.current;
      if (el && !el.contains?.(e.target)) setCreateDropdownOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [createDropdownOpen]);

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



  // Navigating to another folder closes preview modal and clears preview item.
  useEffect(() => {
    closePreview();
  }, [relativePath, closePreview]);

  // Changing the preview target resets viewer state (zoom, page).
  useEffect(() => {
    setPreviewZoom(1);
    setPreviewPage(1);
    setPreviewNumPages(null);
  }, [previewItemId]);

  // Defensive: if the item disappears (refresh/folder change), never keep a ghost "open" state.
  useEffect(() => {
    if (!previewModalOpen) return;
    if (!safeText(previewItemId)) return;
    if (previewItem) return;
    closePreview();
  }, [previewModalOpen, previewItemId, previewItem, closePreview]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e) => {
      const tag = String(e?.target?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e?.target?.isContentEditable)) return;
      const anyModalOpen = createFolderOpen || createOfficeFileOpen || renameOpen || deleteOpen || moveOpen;
      if (anyModalOpen) return;

      if (e?.key === 'Escape') {
        if (previewModalOpen) {
          e.preventDefault();
          closePreview();
        } else if (selectedIds.length > 0) {
          e.preventDefault();
          clearSelection();
        }
        return;
      }
      if (e?.key === 'Delete' || e?.key === 'Backspace') {
        if (selectedItems.length > 0) {
          e.preventDefault();
          setDeleteTargets(selectedItems);
          setDeleteTarget(null);
          setDeleteError('');
          setDeleteOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [
    Platform.OS,
    createFolderOpen,
    createOfficeFileOpen,
    renameOpen,
    deleteOpen,
    moveOpen,
    previewModalOpen,
    selectedIds.length,
    selectedItems,
    clearSelection,
    closePreview,
  ]);

  const pid = project?.id ?? project?.projectId ?? project?.projectNumber ?? null;
  useEffect(() => {
    if (!cid || !pid) {
      setFileCommentCount({});
      return () => {};
    }
    const unsubscribe = subscribeProjectFileComments(cid, pid, {
      onData(comments) {
        const byFile = {};
        (Array.isArray(comments) ? comments : []).forEach((c) => {
          const fid = c?.fileId ? String(c.fileId).trim() : null;
          if (fid) byFile[fid] = (byFile[fid] || 0) + 1;
        });
        setFileCommentCount(byFile);
      },
      onError() {
        setFileCommentCount({});
      },
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [cid, pid]);

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
      // Kort fördröjning så SharePoint hinner indexera nya filer innan vi hämtar listan.
      await new Promise((r) => setTimeout(r, 500));
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    }
  }, [uploadManager, hasContext, siteId, rootPath, relativePath, cid, refresh, existingFileNamesLower, existingFolderNamesLower, onDidMutate]);

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
    if (selectedItemId !== null) setSelectedItemId(null);
    setRelativePath(next);
  };

  const startMove = (it) => {
    setMoveTarget(it);
    setMoveTargets(it ? [it] : []);
    setMoveOpen(true);
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

      const toMove = moveTargets.length > 0 ? moveTargets : (moveTarget ? [moveTarget] : []);
      for (const item of toMove) {
        if (item?.id) await moveDriveItemById(siteId, item.id, destId);
      }
      setMoveOpen(false);
      setMoveTarget(null);
      setMoveTargets([]);
      clearSelection();
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    } catch (e) {
      setMoveError(String(e?.message || e || 'Kunde inte flytta.'));
    }
  };

  const moveItemsToFolder = useCallback(async (itemIds, targetRel) => {
    const ids = Array.isArray(itemIds) ? itemIds.filter(Boolean) : [];
    if (ids.length === 0 || !safeText(siteId)) return;
    if (lockSystemFolder && safeText(systemFolderName) && normalizeKey(targetRel) === normalizeKey(systemFolderName)) {
      setError('Denna mapp är låst. Du kan inte flytta filer hit.');
      return;
    }
    const destPath = joinPath(rootPath, targetRel);
    if (!destPath) return;
    const idSet = new Set(ids.map(String));
    const toMove = (Array.isArray(items) ? items : []).filter((it) => it?.id && idSet.has(String(it.id)));
    for (const item of toMove) {
      if (item?.type === 'folder') {
        const itemPath = joinPath(relativePath, safeText(item?.name));
        if (!itemPath) continue;
        if (targetRel === itemPath || (String(targetRel || '').startsWith(itemPath + '/'))) {
          setError(`Kan inte flytta mappen in i sig själv eller en undermapp.`);
          return;
        }
      }
    }
    setError('');
    try {
      const destItem = await getDriveItemByPath(siteId, `/${destPath}`);
      const destId = safeText(destItem?.id);
      if (!destId) throw new Error('Kunde inte identifiera målmappen.');
      for (const item of toMove) {
        await moveDriveItemById(siteId, item.id, destId);
      }
      const destLabel = targetRel ? targetRel.split('/').pop() || targetRel : 'mappen';
      const n = toMove.length;
      showToast(n === 1
        ? `1 fil flyttades till ${destLabel}`
        : `${n} filer flyttades till ${destLabel}`);
      clearSelection();
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte flytta.'));
    }
  }, [siteId, rootPath, items, relativePath, refresh, onDidMutate, lockSystemFolder, systemFolderName, showToast, clearSelection]);

  useEffect(() => {
    moveItemsToFolderRef.current = moveItemsToFolder;
  }, [moveItemsToFolder]);

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
        disabled: !(isFile || isFolder),
        subtitle: 'Inom Förfrågningsunderlag',
      },
      { isSeparator: true, key: 'sep2' },
      {
        key: 'delete',
        label: 'Radera',
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
      setDeleteTargets([it]);
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
    const toDelete = deleteTargets.length > 0 ? deleteTargets : (deleteTarget ? [deleteTarget] : []);
    if (toDelete.length === 0) return;

    const lockedFolder = toDelete.find((it) => it?.type === 'folder' && lockSystemFolder && isSystemFolder(it));
    if (lockedFolder) {
      setDeleteError('En av de valda objekten är en skyddad systemmapp och kan inte raderas.');
      return;
    }
    if (isWithinSystemFolder) {
      setDeleteError('Skyddade filer i systemmappen kan inte raderas.');
      return;
    }
    if (!safeText(siteId)) {
      setDeleteError('Saknar SharePoint siteId.');
      return;
    }

    try {
      setDeleteError('');

      await runWithConcurrency(toDelete, 2, async (it) => {
        if (!it?.id || !safeText(it?.name)) return;
        const kind = it?.type === 'folder' ? 'folder' : 'file';
        const sourcePath = joinPath(currentPath, safeText(it?.name));
        const pathParts = safeText(sourcePath).split('/').filter(Boolean);
        if (kind === 'folder' && pathParts.length === 1) {
          const rootLower = String(pathParts[0] || '').toLowerCase();
          const blockedRoots = new Set(['projekt', 'mappar', 'arkiv', 'metadata', 'system']);
          if (blockedRoots.has(rootLower)) {
            throw new Error('Denna systemmapp kan inte raderas.');
          }
        }

        await deleteDriveItemById(siteId, it.id);
      });

      setDeleteOpen(false);
      setDeleteTarget(null);
      setDeleteTargets([]);
      clearSelection();
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    } catch (e) {
      console.error('[Delete][File] error', e?.message || e);
      setDeleteError(String(e?.message || e || 'Kunde inte arkivera.'));
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

  const normalizeOfficeFileName = (input, type) => {
    const ext = type === 'docx' ? '.docx' : '.xlsx';
    let base = safeText(input).replace(/[/\\]/g, '').trim();
    if (!base) return type === 'docx' ? 'Dokument.docx' : 'Dokument.xlsx';
    const hasExt = base.toLowerCase().endsWith(ext);
    return hasExt ? base : `${base}${ext}`;
  };

  const performCreateOfficeFile = async (type, fileName) => {
    setCreateOfficeFileOpen(false);
    setNewOfficeFileName('');
    setCreateDropdownOpen(false);
    if (!hasContext || !safeText(siteId)) return;
    const finalName = normalizeOfficeFileName(fileName || '', type);
    const existingNames = new Set((Array.isArray(items) ? items : []).map((it) => safeText(it?.name).toLowerCase()).filter(Boolean));
    const dedupedName = dedupeFileName(finalName, existingNames);
    try {
      if (type === 'docx') {
        const blob = await createEmptyDocxBlob();
        const file = new File([blob], dedupedName, { type: blob.type });
        await uploadEntriesWithPaths([{ file, relativePath: dedupedName }], safeText(relativePath));
      } else if (type === 'xlsx') {
        const blob = createEmptyXlsxBlob();
        const file = new File([blob], dedupedName, { type: blob.type });
        await uploadEntriesWithPaths([{ file, relativePath: dedupedName }], safeText(relativePath));
      }
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte skapa fil.'));
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
    <View style={styles.container}>
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

      <View style={bottomDropZone ? styles.mainColumn : null}>

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
        <View style={[styles.breadcrumbRow, createDropdownOpen && Platform.OS === 'web' ? styles.breadcrumbRowDropdownOpen : null]}>
          <View style={styles.breadcrumbCrumbs}>
            <FileExplorerBreadcrumb
              parts={breadcrumbParts}
              activePath={relativePath}
              onNavigate={(path, idx) => {
                if (typeof onBreadcrumbNavigateToSection === 'function' && idx === 0 && Array.isArray(breadcrumbBaseSegments) && breadcrumbBaseSegments.length > 1) {
                  onBreadcrumbNavigateToSection();
                  return;
                }
                if (selectedItemId !== null) setSelectedItemId(null);
                setRelativePath(path || '');
              }}
            />
          </View>

          {Platform.OS === 'web' ? (
            <View ref={createDropdownRef} style={styles.breadcrumbActions}>
              <Pressable
                onPress={() => {
                  try { fileInputRef.current?.click?.(); } catch (_e) {}
                }}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
                accessibilityRole="button"
              >
                <Text style={{ color: '#525252', fontSize: 13, fontWeight: '500' }}>Välj filer</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  try { folderInputRef.current?.click?.(); } catch (_e) {}
                }}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
                accessibilityRole="button"
              >
                <Text style={{ color: '#525252', fontSize: 13, fontWeight: '500' }}>Välj mapp</Text>
              </Pressable>

              {showCreateFolderButton ? (
              <View style={{ position: 'relative' }}>
                <Pressable
                  onPress={() => setCreateDropdownOpen((v) => !v)}
                  style={({ hovered, pressed }) => ({
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: hovered || pressed ? '#1a2d42' : (ICON_RAIL.bg || '#0f1b2d'),
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  })}
                  accessibilityRole="button"
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>Skapa</Text>
                  <Ionicons name={createDropdownOpen ? 'chevron-up' : 'chevron-down'} size={12} color="#fff" />
                </Pressable>

                {createDropdownOpen ? (
                  <View style={styles.createDropdown} pointerEvents="box-none">
                    <Pressable
                      onPress={() => {
                        setNewFolderName('');
                        setCreateFolderOpen(true);
                        setCreateDropdownOpen(false);
                      }}
                      style={({ hovered }) => [
                        styles.createDropdownItem,
                        hovered && styles.createDropdownItemHover,
                      ]}
                    >
                      <Ionicons name="folder-outline" size={16} color="#525252" />
                      <Text style={styles.createDropdownItemText}>Ny mapp</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setCreateOfficeFileType('docx');
                        setNewOfficeFileName('');
                        setCreateOfficeFileOpen(true);
                        setCreateDropdownOpen(false);
                      }}
                      style={({ hovered }) => [
                        styles.createDropdownItem,
                        hovered && styles.createDropdownItemHover,
                      ]}
                    >
                      <Ionicons name="document-text-outline" size={16} color="#525252" />
                      <Text style={styles.createDropdownItemText}>Word-dokument</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setCreateOfficeFileType('xlsx');
                        setNewOfficeFileName('');
                        setCreateOfficeFileOpen(true);
                        setCreateDropdownOpen(false);
                      }}
                      style={({ hovered }) => [
                        styles.createDropdownItem,
                        hovered && styles.createDropdownItemHover,
                      ]}
                    >
                      <Ionicons name="grid-outline" size={16} color="#525252" />
                      <Text style={styles.createDropdownItemText}>Excel-dokument</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.splitRow, styles.splitRowSingle]}>
        <View style={[styles.listPane, styles.paneStretch]}>
          {Array.isArray(items) && items.length > 0 ? (
            <View style={[styles.searchRow, { marginBottom: 8 }]}>
              <View style={styles.searchInputWrap}>
                <Ionicons name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Sök filer och mappar..."
                  placeholderTextColor="#94A3B8"
                  style={styles.searchInput}
                  {...(Platform.OS === 'web' ? { cursor: 'text' } : {})}
                />
                {searchQuery ? (
                  <Pressable
                    onPress={() => setSearchQuery('')}
                    style={({ hovered }) => ({
                      padding: 4,
                      borderRadius: 6,
                      backgroundColor: hovered ? 'rgba(0,0,0,0.04)' : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    })}
                    accessibilityLabel="Rensa sökning"
                  >
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          {someSelected ? (
            <View style={styles.bulkToolbar}>
              <Text style={styles.bulkToolbarText}>
                {selectedIds.length} {selectedIds.length === 1 ? 'objekt markerat' : 'objekt markerade'}
              </Text>
              <Pressable
                onPress={() => {
                  setMoveTargets(selectedItems);
                  setMoveTarget(null);
                  setMoveOpen(true);
                }}
                style={({ hovered, pressed }) => [
                  styles.bulkToolbarButton,
                  (hovered || pressed) && styles.bulkToolbarButtonHover,
                ]}
              >
                <Ionicons name="return-up-forward-outline" size={16} color="#1976D2" />
                <Text style={styles.bulkToolbarButtonText}>Flytta</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const files = selectedItems.filter((x) => x?.type === 'file');
                  files.forEach((f) => {
                    const url = safeText(f?.downloadUrl || f?.webUrl);
                    if (url) openUrl(url);
                  });
                }}
                style={({ hovered, pressed }) => [
                  styles.bulkToolbarButton,
                  (hovered || pressed) && styles.bulkToolbarButtonHover,
                ]}
              >
                <Ionicons name="download-outline" size={16} color="#1976D2" />
                <Text style={styles.bulkToolbarButtonText}>Ladda ner</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDeleteTargets(selectedItems);
                  setDeleteTarget(null);
                  setDeleteError('');
                  setDeleteOpen(true);
                }}
                style={({ hovered, pressed }) => [
                  styles.bulkToolbarButton,
                  styles.bulkToolbarButtonDanger,
                  (hovered || pressed) && styles.bulkToolbarButtonDangerHover,
                ]}
              >
                <Ionicons name="trash-outline" size={16} color="#B91C1C" />
                <Text style={styles.bulkToolbarButtonTextDanger}>Radera</Text>
              </Pressable>
              <Pressable
                onPress={clearSelection}
                style={({ hovered, pressed }) => [
                  styles.bulkToolbarButton,
                  (hovered || pressed) && styles.bulkToolbarButtonHover,
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748b' }}>Avmarkera alla</Text>
              </Pressable>
            </View>
          ) : null}
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
                  <View style={[styles.colSelect, { width: COL_SELECT_W }]}>
                    {selectableItems.length > 0 ? (
                      <Pressable
                        onPress={() => {
                          if (allSelected) clearSelection();
                          else selectAll();
                        }}
                        style={[styles.selectCircle, allSelected ? styles.selectCircleChecked : null]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: allSelected }}
                        accessibilityLabel={allSelected ? 'Avmarkera alla' : 'Markera alla'}
                      >
                        {allSelected ? (
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        ) : null}
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={[colStyle('name'), styles.colWithResize]}>
                    <Pressable
                      onPress={() => toggleSort('name')}
                      style={({ hovered }) => [styles.sortableHeader, hovered && styles.sortableHeaderHover]}
                      accessibilityRole="button"
                      accessibilityLabel={`Sortera på filnamn, ${sortBy === 'name' ? (sortDir === 'asc' ? 'stigande' : 'fallande') : 'klicka för att sortera'}`}
                    >
                      <Text style={[styles.th]} numberOfLines={1}>Filnamn</Text>
                      {sortBy === 'name' ? (
                        <Ionicons name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#64748b" style={{ marginLeft: 4 }} />
                      ) : (
                        <Ionicons name="swap-vertical-outline" size={14} color="#94A3B8" style={{ marginLeft: 4 }} />
                      )}
                    </Pressable>
                    <ResizeHandle col="name" />
                  </View>
                  <View style={[colStyle('type'), styles.colWithResize]}>
                    <Pressable
                      onPress={() => toggleSort('type')}
                      style={({ hovered }) => [styles.sortableHeader, hovered && styles.sortableHeaderHover]}
                      accessibilityRole="button"
                      accessibilityLabel={`Sortera på typ, ${sortBy === 'type' ? (sortDir === 'asc' ? 'stigande' : 'fallande') : 'klicka för att sortera'}`}
                    >
                      <Text style={[styles.th]} numberOfLines={1}>Typ</Text>
                      {sortBy === 'type' ? (
                        <Ionicons name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#64748b" style={{ marginLeft: 4 }} />
                      ) : (
                        <Ionicons name="swap-vertical-outline" size={14} color="#94A3B8" style={{ marginLeft: 4 }} />
                      )}
                    </Pressable>
                    <ResizeHandle col="type" />
                  </View>
                  {!isCompactTable ? (
                    <View style={[colStyle('uploadedBy'), styles.colWithResize]}>
                      <Text style={[styles.th]} numberOfLines={1}>Uppladdad av</Text>
                      <ResizeHandle col="uploadedBy" />
                    </View>
                  ) : null}
                  {!isCompactTable ? (
                    <Text style={[styles.th, styles.colCreated, { width: COL_DATE_W }]} numberOfLines={1}>Skapad</Text>
                  ) : null}
                  {!isCompactTable ? (
                    <View style={[colStyle('modified'), styles.colWithResize]}>
                      <Pressable
                        onPress={() => toggleSort('modified')}
                        style={({ hovered }) => [styles.sortableHeader, hovered && styles.sortableHeaderHover]}
                        accessibilityRole="button"
                        accessibilityLabel={`Sortera på senast ändrad, ${sortBy === 'modified' ? (sortDir === 'asc' ? 'stigande' : 'fallande') : 'klicka för att sortera'}`}
                      >
                        <Text style={[styles.th]} numberOfLines={1}>Senast ändrad</Text>
                        {sortBy === 'modified' ? (
                          <Ionicons name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#64748b" style={{ marginLeft: 4 }} />
                        ) : (
                          <Ionicons name="swap-vertical-outline" size={14} color="#94A3B8" style={{ marginLeft: 4 }} />
                        )}
                      </Pressable>
                      <ResizeHandle col="modified" />
                    </View>
                  ) : null}
                  <Text style={[styles.th, styles.colMenu, { width: COL_MENU_W }]} numberOfLines={1}>⋮</Text>
                </View>

                {isTableDragActive ? (
                  <View style={[styles.tableDropHint, styles.tableDropHintLarge, { top: tableHeaderHeight }]} pointerEvents="none">
                    <View style={styles.tableDropHintPlate}>
                      <Ionicons name="cloud-upload-outline" size={28} color="rgba(25, 118, 210, 0.9)" style={{ marginBottom: 8 }} />
                      <Text style={styles.tableDropHintText}>
                        Släpp filer för att ladda upp till aktuell mapp
                      </Text>
                    </View>
                  </View>
                ) : null}

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={[
                    { paddingBottom: 12 },
                    !loading && Array.isArray(displayedItems) && displayedItems.length === 0 ? { flexGrow: 1 } : {},
                  ]}
                  pointerEvents="auto"
                >
              {!loading && Array.isArray(displayedItems) && displayedItems.length === 0 ? (
                <View style={styles.emptyStateRow} pointerEvents="none">
                  <View style={styles.emptyStateContent}>
                    <Ionicons name={searchQuery ? 'search-outline' : 'folder-open-outline'} size={40} color="#94A3B8" style={{ marginBottom: 12 }} />
                    <Text style={styles.emptyStateTitle} numberOfLines={1}>
                      {searchQuery ? 'Inga träffar' : 'Inga filer eller mappar ännu'}
                    </Text>
                    <Text style={styles.emptyStateHint} numberOfLines={2}>
                      {searchQuery
                        ? 'Prova ett annat sökord eller rensa sökfältet'
                        : dndTipText}
                    </Text>
                  </View>
                </View>
              ) : null}

              {(Array.isArray(displayedItems) ? displayedItems : []).map((it, idx) => {
            const name = safeText(it?.name) || (it?.type === 'folder' ? 'Mapp' : 'Fil');
            const isFolder = it?.type === 'folder';
            const isLockedFolder = isFolder && lockSystemFolder && isSystemFolder(it);
            const rowRelPath = isFolder ? joinPath(relativePath, name) : '';
            const isRowDragOver = enableWebDnD && isFolder && !isLockedFolder && safeText(activeDropFolder) === safeText(rowRelPath);
            const isRowDragging = draggingIds.includes(String(it?.id || ''));

            // Row state model:
            // - hover: pointer over row (never persists)
            // - selected: user explicitly marks via checkbox (persists)
            // - active/open: preview modal is open for this file (never persists after close)
            const isRowSelected = Boolean(!isLockedFolder && safeText(it?.id) && isIdSelected(it.id));
            const isRowActive = Boolean(!isFolder && previewOpen && safeText(previewItemId) === safeText(it?.id));
            const ext = fileExtFromName(name);
            const typeMeta = isFolder
              ? { label: 'MAPP', icon: 'folder-outline' }
              : classifyFileType(name);

            return (
              <Pressable
                key={safeText(it?.id) || name}
                {...(Platform.OS === 'web' && isFolder && !isLockedFolder ? { dataSet: { dropPath: rowRelPath } } : {})}
                {...(Platform.OS === 'web' && enableWebDnD && !isLockedFolder && (isFolder || it?.type === 'file') && it?.id
                  ? {
                    draggable: true,
                    onDragStart: (e) => {
                      try {
                        const ids = isIdSelected(it.id) ? selectedIds : [it.id];
                        e.dataTransfer.setData(DND_MOVE_TYPE, JSON.stringify({ ids }));
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggingIds(ids);
                      } catch (_e) {}
                    },
                  }
                  : {})}
                {...(enableWebDnD && isFolder && !isLockedFolder
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
                        if (dt && Array.from(dt.types || []).includes(DND_MOVE_TYPE)) {
                          resetDragState();
                          return;
                        }
                        const filesLen = Number(dt?.files?.length || 0);
                        const itemsLen = Number(dt?.items?.length || 0);
                        if ((!dt || filesLen === 0) && itemsLen === 0) return;
                        handleWebDropToDropTarget(e, { type: 'folder-row', relativePath: rowRelPath });
                      } finally {
                        resetDragState();
                      }
                    },
                  }
                  : {})}
                onPress={(e) => {
                  const handled = handleRowClick(it, idx, e, () => {
                    if (isFolder) {
                      if (selectedItemId !== null) setSelectedItemId(null);
                      closePreview();
                      openFolder(name);
                      return;
                    }
                    const id = safeText(it?.id) || null;
                    if (id !== selectedItemId) setSelectedItemId(id);
                    if (id) {
                      setPreviewItemId(id);
                      setPreviewModalOpen(true);
                    } else {
                      openUrl(it?.webUrl);
                    }
                  });
                  if (handled) return;
                }}
                onDoubleClick={Platform.OS === 'web' ? () => {
                  if (isLockedFolder) return;
                  const ext = it?.type === 'file' ? fileExtFromName(name) : '';
                  const initialVal = ext ? splitLockedBaseAndExt(name).base : name;
                  startEdit(it, initialVal);
                } : undefined}
                onContextMenu={Platform.OS === 'web' ? (e) => {
                  try { e.preventDefault(); } catch (_) {}
                  if (!isLockedFolder && (isFolder || it?.type === 'file')) openMenuFor(it, e);
                } : undefined}
                style={({ hovered, pressed }) => ({
                  position: 'relative',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingVertical: 4,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#EEF2F7',
                  opacity: isRowDragging ? 0.8 : 1,
                  ...(isRowDragOver
                    ? {
                      backgroundColor: '#E8F4FD',
                      borderLeftWidth: 2,
                      borderLeftColor: '#2563EB',
                    }
                    : {
                      backgroundColor: isRowActive
                        ? 'rgba(25, 118, 210, 0.12)'
                        : isRowSelected
                          ? (hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'rgba(25, 118, 210, 0.06)')
                          : (hovered || pressed ? '#F8FAFC' : '#fff'),
                      borderLeftWidth: isRowActive ? 3 : 0,
                      borderLeftColor: isRowActive ? '#1976D2' : 'transparent',
                    }),
                  ...(Platform.OS === 'web' ? { cursor: isRowDragging ? 'move' : 'pointer', transition: 'opacity 150ms ease, background-color 150ms ease' } : {}),
                })}
              >
                {isRowDragOver && enableWebDnD ? (
                  <View style={styles.dropHintTooltip} pointerEvents="none">
                    <Text style={styles.dropHintTooltipText}>Flytta hit</Text>
                  </View>
                ) : null}
                {!isLockedFolder && safeText(it?.id) ? (
                  <Pressable
                    style={[styles.colSelect, styles.colSelectPressable, { width: COL_SELECT_W }]}
                    onPress={(e) => {
                      try { e.stopPropagation?.(); } catch (_e2) {}
                      toggleSelection(it.id);
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isIdSelected(it.id) }}
                    accessibilityLabel={isIdSelected(it.id) ? 'Avmarkera' : 'Markera'}
                  >
                    <View style={[styles.selectCircle, isIdSelected(it.id) ? styles.selectCircleChecked : null]}>
                      {isIdSelected(it.id) ? (
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      ) : null}
                    </View>
                  </Pressable>
                ) : (
                  <View style={[styles.colSelect, { width: COL_SELECT_W }]} />
                )}
                <View style={[colStyle('name'), { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <Ionicons name={typeMeta.icon} size={16} color={isFolder ? '#475569' : '#64748b'} />
                  {isEditing(it.id) ? (
                    <View style={styles.inlineRenameWrap}>
                      {it?.type === 'file' && fileExtFromName(name) ? (
                        <View style={styles.inlineRenameRow}>
                          <TextInput
                            ref={inlineRenameInputRef}
                            value={editValue}
                            onChangeText={setEditValue}
                            onKeyDown={(e) => handleInlineRenameKeyDown(e, it)}
                            onBlur={() => commitEdit(it)}
                            style={styles.inlineRenameInput}
                            placeholderTextColor="#9CA3AF"
                            selectTextOnFocus
                            editable={!renameSaving}
                          />
                          <Text style={styles.inlineRenameExt} numberOfLines={1}>{`.${fileExtFromName(name)}`}</Text>
                        </View>
                      ) : (
                        <TextInput
                          ref={inlineRenameInputRef}
                          value={editValue}
                          onChangeText={setEditValue}
                          onKeyDown={(e) => handleInlineRenameKeyDown(e, it)}
                          onBlur={() => commitEdit(it)}
                          style={styles.inlineRenameInput}
                          placeholderTextColor="#9CA3AF"
                          selectTextOnFocus
                          editable={!renameSaving}
                        />
                      )}
                      {renameSaving ? <ActivityIndicator size="small" color="#64748b" style={styles.inlineRenameSpinner} /> : null}
                      {inlineRenameError && isEditing(it.id) ? <Text style={styles.inlineRenameError} numberOfLines={1}>{inlineRenameError}</Text> : null}
                    </View>
                  ) : (
                    <Text style={styles.tdName} numberOfLines={1}>{name}</Text>
                  )}
                  {isLockedFolder ? (
                    <Ionicons name="lock-closed" size={14} color="#94A3B8" style={{ marginLeft: 4 }} />
                  ) : null}
                  {!isFolder && safeText(it?.id) && (fileCommentCount[safeText(it.id)] || 0) > 0 ? (
                    <Pressable
                      onPress={(e) => {
                        try { e.stopPropagation?.(); } catch (_e2) {}
                        setPreviewItemId(it.id);
                        setPreviewModalOpen(true);
                      }}
                      style={({ hovered, pressed }) => ({
                        paddingVertical: 2,
                        paddingHorizontal: 4,
                        borderRadius: 6,
                        backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.15)' : 'rgba(25, 118, 210, 0.08)',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      })}
                      accessibilityLabel={`${fileCommentCount[safeText(it.id)]} kommentar${fileCommentCount[safeText(it.id)] !== 1 ? 'er' : ''} – öppna förhandsvisning`}
                    >
                      <Text style={{ fontSize: 12, color: '#1976D2' }}>
                        💬 {fileCommentCount[safeText(it.id)]}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={[colStyle('type'), { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText} numberOfLines={1}>
                      {(isFolder ? 'MAPP' : (typeMeta?.label || (ext ? ext.toUpperCase() : 'FIL'))).toUpperCase()}
                    </Text>
                  </View>
                </View>

                {!isCompactTable ? (
                  <View style={colStyle('uploadedBy')}>
                    <Text style={styles.tdUploader} numberOfLines={1}>
                      {safeText(it?.createdBy) || '—'}
                    </Text>
                  </View>
                ) : null}

                {!isCompactTable ? (
                  <Text style={[styles.td, styles.colCreated, { width: COL_DATE_W }]} numberOfLines={1}>
                    {isFolder ? '—' : toIsoDateText(it?.createdDate)}
                  </Text>
                ) : null}

                {!isCompactTable ? (
                  <View style={colStyle('modified')}>
                    <Text style={styles.td} numberOfLines={1}>
                      {toIsoDateText(it?.lastModified)}
                    </Text>
                  </View>
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
                    paddingVertical: 4,
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


          {false && bottomDropZone && enableWebDnD ? (
            <Pressable
              onPress={() => {
                try { fileInputRef.current?.click?.(); } catch (_e) {}
              }}
              style={[
                styles.bottomDropZoneInline,
                Platform.OS === 'web' && isDragging ? styles.bottomDropZoneActive : null,
              ]}
              onDragOver={Platform.OS === 'web' ? (e) => {
                try { e.preventDefault(); e.stopPropagation(); } catch (_e) {}
              } : undefined}
              onDragEnter={Platform.OS === 'web' ? (e) => {
                try { e.preventDefault(); } catch (_e) {}
              } : undefined}
              onDrop={Platform.OS === 'web' ? (async (e) => {
                try {
                  e.preventDefault();
                  e.stopPropagation();
                } catch (_e) {}
                resetDragState();
                const dt = e?.dataTransfer;
                if (!dt) return;
                try {
                  const entries = await filesFromDataTransfer(dt);
                  if (entries.length > 0) {
                    await uploadEntriesWithPaths(entries, safeText(relativePath));
                    return;
                  }
                  const list = Array.from(dt?.files || []);
                  if (list.length > 0) {
                    const fileEntries = list.map((file) => ({ file, relativePath: safeText(file?.name) }));
                    await uploadEntriesWithPaths(fileEntries, safeText(relativePath));
                  }
                } catch (err) {
                  setError(String(err?.message || err || 'Kunde inte läsa uppladdningen.'));
                }
              }) : undefined}
              accessibilityRole="button"
            >
              <View style={styles.bottomDropZoneContent}>
                <Ionicons name="cloud-upload-outline" size={18} color={Platform.OS === 'web' && isDragging ? 'rgba(37, 99, 235, 0.9)' : '#94A3B8'} />
                <Text style={[styles.bottomDropZoneText, Platform.OS === 'web' && isDragging ? styles.bottomDropZoneTextActive : null]}>
                  Dra och släpp filer här
                </Text>
                <Text style={[styles.bottomDropZoneSubtext, Platform.OS === 'web' && isDragging ? styles.bottomDropZoneTextActive : null]}>
                  eller klicka för att välja filer
                </Text>
              </View>
            </Pressable>
          ) : null}

          {(loading || (uploadManager?.stats?.activeCount ?? 0) > 0) ? (
            <View style={styles.tableLoadingOverlay} pointerEvents="auto">
              <ActivityIndicator size="large" color="#1976D2" />
              <Text style={styles.tableLoadingOverlayText}>
                {(uploadManager?.stats?.activeCount ?? 0) > 0
                  ? `Laddar upp filer… ${Math.round((uploadManager?.stats?.progress ?? 0) * 100)}%`
                  : 'Laddar…'}
              </Text>
            </View>
          ) : null}
        </View>

      </View>

      </View>

      {previewOpen ? (
        <FilePreviewModal
          visible
          onClose={() => {
            closePreview();
          }}
          fileItem={previewItem}
          onOpenInNewTab={(url) => openUrl(url)}
          maxWidth={1500}
          companyId={cid}
          projectId={project?.id ?? project?.projectId ?? project?.projectNumber ?? null}
          pageNumber={previewPage}
          onRequestPage={setPreviewPage}
          zoomLevel={previewZoom}
          onZoomChange={setPreviewZoom}
          onZoomIn={() => setPreviewZoom((z) => Math.min(3, (z || 1) + 0.25))}
          onZoomOut={() => setPreviewZoom((z) => Math.max(0.5, (z || 1) - 0.25))}
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
            onClose={() => {
              closePreview();
            }}
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

      {/* Create folder modal – golden rule */}
      <FileActionModal
        visible={createFolderOpen}
        onClose={() => {
          setCreateFolderOpen(false);
          setNewFolderName('');
        }}
        bannerTitle="Ny undermapp – Skapa mapp i aktuell mapp"
        primaryLabel="Skapa"
        primaryVariant="dark"
        onPrimary={createFolder}
        primaryDisabled={!safeText(newFolderName)}
      >
        <View style={styles.createFolderModalBody}>
          <Text style={styles.createFolderModalLabel}>Mappnamn</Text>
          <TextInput
            value={newFolderName}
            onChangeText={setNewFolderName}
            placeholder="Ange mappnamn"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            autoFocus
            onSubmitEditing={() => {
              if (safeText(newFolderName)) createFolder();
            }}
            returnKeyType="done"
          />
        </View>
      </FileActionModal>

      <FileActionModal
        visible={createOfficeFileOpen}
        onClose={() => {
          setCreateOfficeFileOpen(false);
          setNewOfficeFileName('');
        }}
        bannerTitle={createOfficeFileType === 'docx' ? 'Nytt Word-dokument' : 'Nytt Excel-dokument'}
        bannerSubtitle="Skapa fil i aktuell mapp"
        primaryLabel="Skapa"
        primaryVariant="dark"
        onPrimary={() => performCreateOfficeFile(createOfficeFileType, newOfficeFileName)}
        primaryDisabled={!safeText(newOfficeFileName)}
      >
        <View style={styles.createFolderModalBody}>
          <Text style={styles.createFolderModalLabel}>Filnamn</Text>
          <TextInput
            value={newOfficeFileName}
            onChangeText={setNewOfficeFileName}
            placeholder={createOfficeFileType === 'docx' ? 'Ange filnamn (t.ex. Rapport.docx)' : 'Ange filnamn (t.ex. Budget.xlsx)'}
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            autoFocus
            onSubmitEditing={() => {
              if (safeText(newOfficeFileName)) performCreateOfficeFile(createOfficeFileType, newOfficeFileName);
            }}
            returnKeyType="done"
          />
        </View>
      </FileActionModal>

      <FileActionModal
        visible={renameOpen}
        bannerTitle={(() => {
          if (!renameTarget) return 'Byt namn';
          const targetName = safeText(renameTarget?.name) || 'objekt';
          if (renameTarget?.type === 'file' && safeText(renameLockedExt)) {
            return `Byt namn – Byter namn på "${targetName}" (.${safeText(renameLockedExt)} behålls)`;
          }
          return `Byt namn – Byter namn på "${targetName}"`;
        })()}
        onClose={() => {
          setRenameOpen(false);
          setRenameTarget(null);
          setRenameError('');
        }}
        primaryLabel="Spara"
        primaryVariant="dark"
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
        bannerTitle={
          deleteTargets.length > 1
            ? `Radera – ${deleteTargets.length} objekt?`
            : (deleteTargets[0] || deleteTarget)
              ? `Radera – "${safeText((deleteTargets[0] || deleteTarget)?.name) || 'objekt'}"?`
              : 'Radera'
        }
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
          setDeleteTargets([]);
          setDeleteError('');
        }}
        primaryLabel="Radera"
        primaryVariant="danger"
        onPrimary={performDelete}
        primaryDisabled={deleteTargets.length === 0 && !deleteTarget}
      >
        {deleteError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{deleteError}</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 13, fontWeight: '400', color: '#64748b', lineHeight: 18 }}>
            Objekten läggs i papperskorgen i SharePoint. Du kan återställa dem från papperskorgen under en tid om du behöver.
          </Text>
        )}
      </FileActionModal>

      <MoveFilesModal
        visible={moveOpen}
        onClose={() => {
          setMoveOpen(false);
          setMoveTarget(null);
          setMoveTargets([]);
        }}
        companyId={cid}
        sourceSiteId={siteId}
        itemsToMove={moveTargets.length > 0 ? moveTargets : (moveTarget ? [moveTarget] : [])}
        sourceItemPaths={(moveTargets.length > 0 ? moveTargets : (moveTarget ? [moveTarget] : [])).map((it) => ({
          id: it?.id,
          path: joinPath(currentPath, safeText(it?.name)),
        }))}
        onMoveSuccess={async () => {
          clearSelection();
          await refresh();
          try { if (typeof onDidMutate === 'function') onDidMutate(); } catch (_e) {}
        }}
        showToast={showToast}
      />

      {toast.visible ? (
        <View
          pointerEvents="none"
          style={[
            styles.toast,
            Platform.OS === 'web' ? { position: 'fixed' } : { position: 'absolute' },
          ]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      ) : null}
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
  toast: {
    top: 16,
    right: 16,
    zIndex: 2147483647,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : {}),
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
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
    position: 'relative',
  },

  tableLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    gap: 12,
  },

  tableLoadingOverlayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
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
    justifyContent: 'center',
  },

  tableDropHintLarge: {
    minHeight: 120,
    left: 16,
    right: 16,
  },

  tableDropHintText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(25, 118, 210, 0.95)',
  },

  dropHintTooltip: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    zIndex: 3,
  },
  dropHintTooltipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#2563EB',
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
    paddingVertical: 6,
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    backgroundColor: '#fff',
  },

  emptyStateRow: {
    flex: 1,
    minHeight: 260,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 40,
    paddingHorizontal: 24,
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

  emptyStateContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    minHeight: 120,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyStateHint: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    maxWidth: 320,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: '#334155',
    paddingVertical: 4,
    paddingHorizontal: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  sortableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  sortableHeaderHover: {
    ...(Platform.OS === 'web' ? { backgroundColor: 'rgba(0,0,0,0.03)' } : {}),
  },

  colWithResize: {
    position: 'relative',
  },
  resizeHandle: {
    ...(Platform.OS === 'web'
      ? {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 6,
        cursor: 'col-resize',
      }
      : {}),
  },

  colSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },

  colSelectPressable: {
    alignSelf: 'stretch',
    minHeight: 32,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },

  selectCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },

  selectCircleChecked: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },

  bulkToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },

  bulkToolbarText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginRight: 8,
  },

  bulkToolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },

  bulkToolbarButtonHover: {
    backgroundColor: 'rgba(25, 118, 210, 0.08)',
  },

  bulkToolbarButtonDanger: {},
  bulkToolbarButtonDangerHover: {
    backgroundColor: '#FEF2F2',
  },

  bulkToolbarButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
  },

  bulkToolbarButtonTextDanger: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
  },

  mainColumn: {
    flex: 1,
    minHeight: 0,
  },

  bottomDropZone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    minHeight: 72,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginTop: 12,
    marginHorizontal: -18,
    marginBottom: -18,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 0,
  },

  bottomDropZoneInline: {
    flexShrink: 0,
    minHeight: 48,
    maxHeight: 80,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s' } : {}),
  },

  bottomDropZoneContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },

  bottomDropZoneActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
    borderColor: 'rgba(37, 99, 235, 0.35)',
  },

  bottomDropZoneText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },

  bottomDropZoneSubtext: {
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
  },

  bottomDropZoneTextActive: {
    color: 'rgba(37, 99, 235, 0.95)',
  },

  tableInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.4)',
    backgroundColor: 'rgba(226, 232, 240, 0.65)',
  },

  tableInfoRowText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(71, 85, 105, 0.85)',
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
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 320,
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 2,
    borderColor: 'rgba(25, 118, 210, 0.35)',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    ...(Platform.OS === 'web'
      ? {
        boxShadow: '0 12px 40px rgba(25, 118, 210, 0.15)',
        backdropFilter: 'blur(8px)',
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
  breadcrumbRowDropdownOpen: {
    position: 'relative',
    zIndex: 200,
  },
  breadcrumbCrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  createDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    minWidth: 180,
    backgroundColor: '#fff',
    borderRadius: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' } : {}),
    overflow: 'hidden',
    zIndex: 300,
  },
  createDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  createDropdownItemHover: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  createDropdownItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#171717',
  },
  breadcrumbActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 'auto',
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
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111',
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },

  createFolderModalBody: {
    padding: 20,
    paddingTop: 16,
  },
  createFolderModalLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
    marginBottom: 8,
  },

  inlineRenameWrap: {
    flex: 1,
    minWidth: 0,
  },
  inlineRenameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  inlineRenameInput: {
    flex: 1,
    minWidth: 40,
    fontSize: 13,
    color: '#111',
    paddingVertical: 2,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  inlineRenameExt: {
    fontSize: 13,
    color: '#64748b',
    marginLeft: 2,
  },
  inlineRenameSpinner: {
    position: 'absolute',
    right: 0,
    top: 2,
  },
  inlineRenameError: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 2,
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
