/**
 * FragaSvarView
 * (Översikt 04) – Table view (step 1).
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from 'react-native';
import { WebView } from 'react-native-webview';
import { v4 as uuidv4 } from 'uuid';

import { MODAL_DESIGN_2026 } from '../../../../../../../../constants/modalDesign2026';
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../../../../../../../../constants/tableLayout';
import IsoDatePickerModal from '../../../../../../../../components/common/Modals/IsoDatePickerModal';
import { useDraggableResizableModal } from '../../../../../../../../hooks/useDraggableResizableModal';
import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';
import ContextMenu from '../../../../../../../../components/ContextMenu';
import ErrorBoundary from '../../../../../../../../components/ErrorBoundary';
import { auth, createFsAssignmentNotification, fetchByggdelar, formatSharePointProjectFolderName, logCompanyActivity, patchCompanyProject } from '../../../../../../../../components/firebase';
import { useProjectOrganisation } from '../../../../../../../../hooks/useProjectOrganisation';
import { deleteFile, ensureFolderPath, getDriveItemByPath, renameDriveItemByIdGuarded, resolveProjectRootFolderPath as resolveProjectRootFolderPathInSite, uploadFile } from '../../../../../../../../services/azure/fileService';
import { getSiteByUrl } from '../../../../../../../../services/azure/siteService';
import { getSharePointFolderItems } from '../../../../../../../../services/sharepoint/sharePointStructureService';
import {
  createFragaSvarItem,
  deleteFragaSvarItem,
  getFragaSvarItemsOnce,
  listenFragaSvarItems,
  setFragaSvarNextFsSeq,
  updateFragaSvarItem,
} from '../../../../services/fragaSvarService';

import { subscribeFsExcelSyncState } from '../../../../services/fragaSvarExcelSyncQueue';

function confirmWebOrNative(message) {
  if (Platform.OS === 'web') return window.confirm(message);
  return new Promise((resolve) => {
    Alert.alert('Bekräfta', message, [
      { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Ta bort', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function normalizeGraphPath(path) {
  const s = String(path || '').trim();
  if (!s) return '/';
  const trimmed = s.replace(/^\/+/, '').replace(/\/+$/, '');
  return `/${trimmed}`;
}

function safeText(s) {
  return String(s || '').trim();
}

const FS_LOG_FILENAME = 'FS-logg.xlsx';
const FS_LOG_SHEET_NAME = 'FS-logg';
const FS_LOG_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Bump this when FS-logg workbook structure/linking changes.
// This forces a one-time retroactive rewrite for existing projects (idempotent).
const FS_LOG_FORMAT_VERSION = 'v2026-01-30-live-sync-fs-tabs-only';

// Leave some space above the register for future branding/project info.
const FS_LOG_TABLE_START_ROW = 6; // 1-based (header row)
const FS_LOG_TABLE_ORIGIN = `A${FS_LOG_TABLE_START_ROW}`;

const FS_LOG_LOCK_TTL_MS = 2 * 60 * 1000;

const FW_MED = '500';

const EXCEL_LINK_BLUE = '0563C1';

function normalizeHexRgb(hex) {
  const s = String(hex || '').trim().replace(/^#/, '');
  if (s.length === 6) return s.toUpperCase();
  if (s.length === 3) return `${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toUpperCase();
  return 'FFFFFF';
}

function solidFill(hex) {
  return { patternType: 'solid', fgColor: { rgb: normalizeHexRgb(hex) } };
}

function applyFillToCell(cell, hex) {
  if (!cell) return;
  cell.s = { ...(cell.s || {}), fill: solidFill(hex) };
}

function applyLinkStyleToCell(cell) {
  if (!cell) return;
  const prev = cell.s || {};
  cell.s = {
    ...prev,
    font: {
      ...(prev.font || {}),
      color: { rgb: EXCEL_LINK_BLUE },
      underline: true,
    },
  };
}

function deriveTitleFromText(value, maxLen = 80) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

function sanitizeSharePointFolderName(name, maxLen = 100) {
  const raw = String(name || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  // SharePoint/Windows invalid chars: \ / : * ? " < > |
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.]+$/g, '');
  if (!cleaned) return '';
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen).trim().replace(/[\s.]+$/g, '');
}

function formatFsLogFileName(projectNumber, projectName) {
  const pn = sanitizeSharePointFolderName(safeText(projectNumber) || 'Utan nummer', 80) || 'Utan nummer';
  const pnm = sanitizeSharePointFolderName(safeText(projectName) || 'Utan namn', 80) || 'Utan namn';
  return `${pn} – ${pnm} – ${FS_LOG_FILENAME}`;
}

function sanitizeExcelSheetName(name) {
  const raw = String(name || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Sheet';
  // Excel sheet name rules: max 31 chars, cannot contain: : \ / ? * [ ]
  const cleaned = raw
    .replace(/[:\\/\?\*\[\]]/g, '-')
    .replace(/[\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 31) || 'Sheet';
}

function makeUniqueExcelSheetName(preferred, used) {
  const base = sanitizeExcelSheetName(preferred);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let i = 2; i < 100; i += 1) {
    const suffix = ` (${i})`;
    const truncated = base.slice(0, Math.max(0, 31 - suffix.length)).trim();
    const candidate = sanitizeExcelSheetName(`${truncated}${suffix}`);
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const fallback = sanitizeExcelSheetName(`${base.slice(0, 20)}_${Date.now()}`);
  used.add(fallback);
  return fallback;
}

function escapeExcelSheetForLink(name) {
  // Excel internal hyperlinks use single quotes; escape single quote by doubling it.
  return String(name || '').replace(/'/g, "''");
}

function fileKey(file) {
  if (!file) return '';
  const name = String(file?.name || '');
  const size = String(file?.size || '');
  const lm = String(file?.lastModified || '');
  return `${name}|${size}|${lm}`;
}

function uniqFiles(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((f) => {
    const k = fileKey(f);
    if (!k) return;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(f);
  });
  return out;
}

function uniqAttachments(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((a) => {
    const url = String(a?.webUrl || '').trim();
    const name = String(a?.name || '').trim();
    if (!url) return;
    const key = `${url}|${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const attachedInRaw = String(a?.attachedIn || '').trim().toLowerCase();
    const attachedIn = (attachedInRaw === 'answer' || attachedInRaw === 'question') ? attachedInRaw : 'question';
    out.push({
      name: name || url,
      webUrl: url,
      fileType: String(a?.fileType || '').trim() || null,
      addedAt: a?.addedAt || new Date().toISOString(),
      addedByUid: a?.addedByUid || null,
      addedByName: a?.addedByName || null,
      attachedIn,
    });
  });
  return out;
}

function normalizeAttachedIn(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'answer') return 'answer';
  return 'question';
}

function mergeLiveFilesWithAttachments(liveFiles, attachments) {
  const liveArr = Array.isArray(liveFiles) ? liveFiles : [];
  const attArr = Array.isArray(attachments) ? attachments : [];

  const liveByUrl = new Map();
  for (const f of liveArr) {
    const url = safeText(f?.webUrl);
    if (!url) continue;
    liveByUrl.set(url, f);
  }

  const out = [];
  const seen = new Set();

  // 1) Keep Firestore order and metadata (attachedIn etc.), enrich with live data.
  for (const a of attArr) {
    const url = safeText(a?.webUrl);
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const live = liveByUrl.get(url);
    out.push({
      name: safeText(a?.name) || safeText(live?.name) || 'Fil',
      webUrl: url,
      downloadUrl: safeText(live?.downloadUrl) || null,
      createdBy: safeText(live?.createdBy) || null,
      lastModified: safeText(live?.lastModified) || null,

      fileType: safeText(a?.fileType) || fileTypeFromName(a?.name) || fileTypeFromName(live?.name) || null,
      addedAt: a?.addedAt || safeText(live?.lastModified) || null,
      addedByUid: a?.addedByUid || null,
      addedByName: a?.addedByName || safeText(live?.createdBy) || null,
      attachedIn: normalizeAttachedIn(a?.attachedIn),
    });
  }

  // 2) Add live files missing metadata (fallback -> question).
  for (const f of liveArr) {
    const url = safeText(f?.webUrl);
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const name = safeText(f?.name) || 'Fil';
    out.push({
      name,
      webUrl: url,
      downloadUrl: safeText(f?.downloadUrl) || null,
      createdBy: safeText(f?.createdBy) || null,
      lastModified: safeText(f?.lastModified) || null,

      fileType: fileTypeFromName(name) || null,
      addedAt: safeText(f?.lastModified) || null,
      addedByUid: null,
      addedByName: safeText(f?.createdBy) || null,
      attachedIn: 'question',
    });
  }

  return out;
}

function normalizeBd(value) {
  return String(value || '').trim();
}

function normalizeDateYmd(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  // accept YYYY-MM-DD only (simple + consistent)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function toDateSafe(value) {
  if (!value) return null;
  try {
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
  } catch (_e) {}
  return null;
}

function toYmd(value) {
  const d = toDateSafe(value);
  if (d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = safeText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

function formatFsNumberFromItem(it) {
  const seq = Number(it?.fsSeq);
  if (Number.isFinite(seq) && seq > 0) return `FS${String(seq).padStart(2, '0')}`;
  const raw = safeText(it?.fsNumber);
  const m = raw.match(/^FS(\d+)$/i);
  if (m) return `FS${String(Number(m[1])).padStart(2, '0')}`;
  return raw;
}

function formatDateTime(value) {
  const d = toDateSafe(value);
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch (_e) {
    return d.toISOString();
  }
}

function extractProjectParticipantUids(project) {
  const raw = Array.isArray(project?.participants)
    ? project.participants
    : (Array.isArray(project?.localParticipants) ? project.localParticipants : []);

  const out = [];
  for (const p of raw) {
    if (!p) continue;
    if (typeof p === 'string') {
      out.push(p);
      continue;
    }
    const uid = p?.uid || p?.id || p?.userId;
    if (uid) out.push(uid);
  }
  return Array.from(new Set(out.map((x) => String(x || '').trim()).filter(Boolean)));
}

function formatDateYmd(value) {
  const s = String(value || '').trim();
  if (!s) return '—';
  return s;
}

const STATUSES = ['Obesvarad', 'Pågår', 'Klar', 'Ej aktuell'];

// Disciplin: describes the domain/area the question concerns (not a person).
// MUST match the exact list + order from requirements.
const DISCIPLINE_CHOICES = [
  'Arkitekt',
  'Konstruktör',
  'EL',
  'Vent',
  'VS',
  'Styr',
  'Mark',
  'Intern',
  'Beställare',
  'Lås och beslag',
  'Övrigt',
];

function normalizeDiscipline(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const s = raw.toLowerCase();
  const map = {
    // Backwards compatible / common synonyms
    vvs: 'VS',
    vs: 'VS',
    ventilation: 'Vent',
    vent: 'Vent',
    el: 'EL',
    styr: 'Styr',
    arkitekt: 'Arkitekt',
    konstruktör: 'Konstruktör',
    konstruktor: 'Konstruktör',
    mark: 'Mark',
    intern: 'Intern',
    beställare: 'Beställare',
    bestallare: 'Beställare',
    'lås och beslag': 'Lås och beslag',
    'las och beslag': 'Lås och beslag',
    övrigt: 'Övrigt',
    ovrigt: 'Övrigt',

    // Legacy values that no longer exist as a discipline choice
    ue: 'Övrigt',
    konsult: 'Övrigt',
    brand: 'Övrigt',
  };

  const normalized = map[s] || raw;
  return DISCIPLINE_CHOICES.includes(normalized) ? normalized : 'Övrigt';
}

function displayDiscipline(it) {
  const d = normalizeDiscipline(it?.discipline);
  if (d) return d;
  // Backwards: previously stored in stalledTill
  return normalizeDiscipline(it?.stalledTill);
}

function normalizeResponsibleKeys(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((x) => String(x || '').trim()).filter(Boolean)),
    );
  }
  const s = String(value || '').trim();
  return s ? [s] : [];
}

function resolveResponsiblesByKeys(groups, keys, assignedMeta = null) {
  const ks = normalizeResponsibleKeys(keys);
  const out = [];
  const userMeta = assignedMeta && typeof assignedMeta === 'object' ? assignedMeta : {};
  for (const k of ks) {
    const resolved = findResponsibleByKey(groups, k);
    if (!resolved?.member) continue;
    out.push({
      groupId: safeText(resolved?.group?.id) || null,
      memberId: safeText(resolved?.member?.id) || null,
      source: safeText(resolved?.member?.source) || null,
      refId: safeText(resolved?.member?.refId) || null,
      name: safeText(resolved?.member?.name) || null,
      email: safeText(resolved?.member?.email) || null,
      role: safeText(resolved?.member?.role) || null,
      groupTitle: safeText(resolved?.group?.title) || null,
      assignedAt: safeText(userMeta?.assignedAt) || new Date().toISOString(),
      assignedByUid: safeText(userMeta?.assignedByUid) || null,
      assignedByName: safeText(userMeta?.assignedByName) || null,
    });
  }
  // Deduplicate on groupId+memberId
  const seen = new Set();
  return out.filter((r) => {
    const key = `${safeText(r?.groupId)}:${safeText(r?.memberId)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeResponsiblesFromItem(it) {
  const list = Array.isArray(it?.responsibles) ? it.responsibles : [];
  if (list.length > 0) return list.filter(Boolean);
  const legacy = it?.responsible && typeof it.responsible === 'object' ? it.responsible : null;
  return legacy ? [legacy] : [];
}

function formatResponsiblesSummary(it) {
  const list = normalizeResponsiblesFromItem(it);
  if (list.length === 0) return '—';
  const names = list.map((r) => safeText(r?.name)).filter(Boolean);
  if (names.length === 0) return '—';
  return names.join(', ');
}

function responsibleKey(groupId, memberId) {
  const g = String(groupId || '').trim();
  const m = String(memberId || '').trim();
  if (!g || !m) return '';
  return `${g}:${m}`;
}

function findResponsibleByKey(groups, key) {
  const k = String(key || '').trim();
  if (!k) return null;
  const parts = k.split(':');
  if (parts.length < 2) return null;
  const gid = parts[0];
  const mid = parts.slice(1).join(':');
  const gs = Array.isArray(groups) ? groups : [];
  const group = gs.find((g) => String(g?.id || '').trim() === gid) || null;
  if (!group) return null;
  const member = (Array.isArray(group?.members) ? group.members : []).find((m) => String(m?.id || '').trim() === mid) || null;
  if (!member) return null;
  return { group, member };
}

function displayStatusLabel(value) {
  const s = String(value || '').trim();
  return s;
}

function normalizeStatusValue(value) {
  const s = String(value || '').trim();
  // Backwards compatible: older data stored "Klart"
  if (s === 'Klart') return 'Klar';
  return s || 'Obesvarad';
}

function fileTypeFromName(name) {
  const s = String(name || '').trim();
  const m = s.match(/\.([a-zA-Z0-9]+)$/);
  if (!m) return '';
  return String(m[1] || '').trim().toLowerCase();
}

function classifyFileType(nameOrType) {
  const s = String(nameOrType || '').trim().toLowerCase();
  const ext = fileTypeFromName(s) || s;
  if (ext === 'pdf') return { kind: 'pdf', label: 'PDF' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return { kind: 'image', label: 'Bild' };
  if (ext) return { kind: 'file', label: ext.toUpperCase() };
  return { kind: 'file', label: 'FIL' };
}

function fileTableRowKey(row, index) {
  return `${safeText(row?.webUrl || row?.name)}-${index}`;
}

function toTableRowFromLiveFile(f) {
  const name = safeText(f?.name) || 'Fil';
  const { label } = classifyFileType(name);
  return {
    name,
    fileTypeLabel: label,
    uploadedBy: safeText(f?.createdBy) || '—',
    dateText: formatDateTime(f?.lastModified) || '—',
    webUrl: safeText(f?.webUrl) || null,
    downloadUrl: safeText(f?.downloadUrl) || null,
  };
}

function toTableRowFromAttachment(a) {
  const name = safeText(a?.name) || 'Fil';
  const { label } = classifyFileType(safeText(a?.fileType) || name);
  return {
    name,
    fileTypeLabel: label,
    uploadedBy: safeText(a?.addedByName) || '—',
    dateText: formatDateTime(a?.addedAt) || '—',
    webUrl: safeText(a?.webUrl) || null,
    downloadUrl: null,
  };
}

function todayYmd() {
  try {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (_e) {
    return '';
  }
}

function isOverdueNeedsAnswerBy(ymd) {
  const s = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = todayYmd();
  if (!t) return false;
  return s < t; // lexicographic works for YYYY-MM-DD
}

function Pill({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }) => ({
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: active ? '#1976D2' : '#E2E8F0',
        backgroundColor: active ? '#EAF3FF' : '#fff',
        marginRight: 8,
        ...(Platform.OS === 'web' && hovered ? { borderColor: '#1976D2' } : {}),
        ...(pressed ? { opacity: 0.9 } : {}),
      })}
    >
      <Text style={{ fontSize: 12, color: active ? '#155FB5' : '#475569', fontWeight: FW_MED }}>{label}</Text>
    </Pressable>
  );
}

export default function FragaSvarView({ projectId, companyId, project, hidePageHeader = false }) {
  const COLORS = {
    blue: '#1976D2',
    blueHover: '#155FB5',
    border: '#E6E8EC',
    borderStrong: '#D1D5DB',
    bgMuted: '#F8FAFC',
    text: MODAL_DESIGN_2026.tableCellColor,
    textMuted: '#475569',
    textSubtle: MODAL_DESIGN_2026.tableCellMutedColor,
    inputBorder: '#E2E8F0',
    tableBorder: MODAL_DESIGN_2026.tableBorderColor,
    tableHeaderBg: MODAL_DESIGN_2026.tableHeaderBackgroundColor,
    tableHeaderText: MODAL_DESIGN_2026.tableHeaderColor,
    tableRowBorder: MODAL_DESIGN_2026.tableRowBorderColor,
    tableRowBg: MODAL_DESIGN_2026.tableRowBackgroundColor,
    tableRowAltBg: MODAL_DESIGN_2026.tableRowAltBackgroundColor,
    tableRowHoverBg: MODAL_DESIGN_2026.tableRowHoverBackgroundColor,
    danger: '#DC2626',
  };

  const PRIMARY_ACTION_BUTTON_BASE = {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.blue,
  };

  const hasContext = safeText(companyId) && safeText(projectId);

  const {
    groups: orgGroups,
    loading: orgLoading,
    error: orgError,
    addGroup: addOrgGroup,
    addMember: addOrgMember,
  } = useProjectOrganisation({ companyId, projectId });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sharePointError, setSharePointError] = useState('');
  const [excelSyncInfo, setExcelSyncInfo] = useState('');
  const [items, setItems] = useState([]);
  const itemsRef = useRef([]);
  useEffect(() => {
    itemsRef.current = Array.isArray(items) ? items : [];
  }, [items]);

  // Excel is a rebuild-based report and may be delayed while the file is open (423 resourceLocked).
  // Show a discreet info message while the queue is retrying.
  useEffect(() => {
    if (!hasContext) return;
    return subscribeFsExcelSyncState(companyId, projectId, (st) => {
      const state = safeText(st?.state);
      const shouldShow = state === 'locked';
      setExcelSyncInfo(shouldShow ? 'Excel-loggen uppdateras automatiskt när filen är ledig.' : '');
    });
  }, [hasContext, companyId, projectId]);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Alla');
  const [showDeleted, setShowDeleted] = useState(false);
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('asc');

  const [optimisticallyDeletedById, setOptimisticallyDeletedById] = useState({});
  // Prevent race condition when deleting FS items: only one row can be in "deleting" state at a time
  const [deletingFsId, setDeletingFsId] = useState(null);

  const [statusMenuVisible, setStatusMenuVisible] = useState(false);
  const [statusMenuPos, setStatusMenuPos] = useState({ x: 20, y: 64 });

  const [rowStatusMenuVisible, setRowStatusMenuVisible] = useState(false);
  const [rowStatusMenuPos, setRowStatusMenuPos] = useState({ x: 20, y: 64 });
  const [rowStatusTarget, setRowStatusTarget] = useState(null);

  const [panelVisible, setPanelVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedRowId, setSelectedRowId] = useState(null);

  const { boxStyle: fsModalBoxStyle, overlayStyle: fsModalOverlayStyle, headerProps: fsModalHeaderProps, resizeHandles: fsModalResizeHandles } = useDraggableResizableModal(panelVisible, { defaultWidth: 900, defaultHeight: 620, minWidth: 520, minHeight: 380 });

  // Rättighet att radera FS: endast admin/projektadmin (företagsadmin) för aktuellt företag
  const [canDeleteFs, setCanDeleteFs] = useState(false);
  useEffect(() => {
    if (!hasContext || !companyId) {
      setCanDeleteFs(false);
      return;
    }
    const user = auth?.currentUser;
    if (!user?.getIdTokenResult) {
      setCanDeleteFs(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const tokenRes = await user.getIdTokenResult(false).catch(() => null);
        const claims = tokenRes?.claims;
        const companyFromClaims = String(claims?.companyId || '').trim();
        const sameCompany = companyFromClaims === String(companyId || '').trim();
        const isAdmin = !!(claims?.admin === true || String(claims?.role || '').toLowerCase() === 'admin');
        const isSuperadmin = !!(claims?.superadmin === true || String(claims?.role || '').toLowerCase() === 'superadmin');
        if (!cancelled) {
          setCanDeleteFs(sameCompany && (isAdmin || isSuperadmin));
        }
      } catch (_e) {
        if (!cancelled) setCanDeleteFs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hasContext, companyId]);

  // Quick-create (collapsible panel)
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [quickBd, setQuickBd] = useState('');
  const [quickDiscipline, setQuickDiscipline] = useState('');
  const [quickResponsibleKeys, setQuickResponsibleKeys] = useState([]);
  const [quickNeedsAnswerBy, setQuickNeedsAnswerBy] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickQuestion, setQuickQuestion] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickAttemptedSubmit, setQuickAttemptedSubmit] = useState(false);
  const quickQuestionRef = useRef(null);
  const [quickFiles, setQuickFiles] = useState([]); // staged files (uploaded after creation)
  const [quickUploadingFiles, setQuickUploadingFiles] = useState(false);
  const [quickUploadError, setQuickUploadError] = useState('');
  const quickFileInputRef = useRef(null);
  const quickEnsureRef = useRef(null); // { promise }
  const [quickDrag, setQuickDrag] = useState(false);

  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillInfo, setBackfillInfo] = useState('');

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewName, setPreviewName] = useState('');
  const [previewKind, setPreviewKind] = useState('file');
  const previewBlobUrlRef = useRef(null);

  const [fsFolderFilesById, setFsFolderFilesById] = useState({});
  const [fsFolderFilesLoadingById, setFsFolderFilesLoadingById] = useState({});

  const [rowUploadingById, setRowUploadingById] = useState({});
  const [rowUploadErrorById, setRowUploadErrorById] = useState({});
  const rowFileInputRef = useRef(null);
  const [rowUploadTargetId, setRowUploadTargetId] = useState(null);
  const [rowUploadTargetAttachedIn, setRowUploadTargetAttachedIn] = useState('question');
  const rowEnsureRef = useRef(null); // { id, promise }

  const [formBd, setFormBd] = useState('');
  const [formNeedsAnswerBy, setFormNeedsAnswerBy] = useState('');
  const [formDiscipline, setFormDiscipline] = useState('');
  const [formResponsibleKeys, setFormResponsibleKeys] = useState([]);
  const [formTitle, setFormTitle] = useState('');
  const [formQuestion, setFormQuestion] = useState('');
  const [formStatus, setFormStatus] = useState('Obesvarad');
  const [formAnswer, setFormAnswer] = useState('');
  const [formAttachments, setFormAttachments] = useState([]);
  const [formStagedQuestionFiles, setFormStagedQuestionFiles] = useState([]); // staged files (uploaded after create)
  const [formStagedAnswerFiles, setFormStagedAnswerFiles] = useState([]); // staged files (uploaded after create)
  const [formAnswersHistory, setFormAnswersHistory] = useState([]);
  const [formSharePointFolderPath, setFormSharePointFolderPath] = useState(null);
  const [saving, setSaving] = useState(false);

  const [questionInputHeight, setQuestionInputHeight] = useState(72);
  const [answerInputHeight, setAnswerInputHeight] = useState(110);

  const [quickQuestionHeight, setQuickQuestionHeight] = useState(74);

  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState('quick'); // 'quick' | 'form'

  // Disciplin dropdown (web)
  const [disciplineMenuVisible, setDisciplineMenuVisible] = useState(false);
  const [disciplineMenuPos, setDisciplineMenuPos] = useState({ x: 20, y: 64 });
  const [disciplineMenuFor, setDisciplineMenuFor] = useState('quick'); // 'quick' | 'form'

  // Byggdel dropdown (valfri – från företagets register)
  const [byggdelarList, setByggdelarList] = useState([]);
  const [byggdelMenuVisible, setByggdelMenuVisible] = useState(false);
  const [byggdelMenuPos, setByggdelMenuPos] = useState({ x: 20, y: 64 });
  const [byggdelMenuFor, setByggdelMenuFor] = useState('form'); // 'quick' | 'form'
  const [byggdelPickerSearch, setByggdelPickerSearch] = useState('');

  // Ansvarig picker (searchable multi-select)
  const [responsiblePickerVisible, setResponsiblePickerVisible] = useState(false);
  const [responsiblePickerFor, setResponsiblePickerFor] = useState('quick'); // 'quick' | 'form'
  const [responsiblePickerSearch, setResponsiblePickerSearch] = useState('');
  const [responsiblePickerPendingKeys, setResponsiblePickerPendingKeys] = useState([]); // lokala val i modalen; sparas bara vid "Lägg till"
  const [responsibleGroupOpen, setResponsibleGroupOpen] = useState({}); // grupp-id -> öppen (intern alltid true)

  const [externalPersonModalVisible, setExternalPersonModalVisible] = useState(false);
  const [externalPersonName, setExternalPersonName] = useState('');
  const [externalPersonEmail, setExternalPersonEmail] = useState('');
  const [externalPersonRole, setExternalPersonRole] = useState('');
  const [externalPersonGroupId, setExternalPersonGroupId] = useState('');
  const [externalPersonCreatingGroup, setExternalPersonCreatingGroup] = useState(false);
  const [externalPersonNewGroupTitle, setExternalPersonNewGroupTitle] = useState('');
  const [externalPersonSaving, setExternalPersonSaving] = useState(false);
  const [externalPersonError, setExternalPersonError] = useState('');
  const [externalPersonTarget, setExternalPersonTarget] = useState('quick'); // 'quick' | 'form'

  const [externalGroupMenuVisible, setExternalGroupMenuVisible] = useState(false);
  const [externalGroupMenuPos, setExternalGroupMenuPos] = useState({ x: 20, y: 64 });

  const originalAnswerRef = useRef('');
  const migratedItemIdsRef = useRef(new Set());

  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const questionFileInputRef = useRef(null);
  const answerFileInputRef = useRef(null);
  const formEnsureRef = useRef(null); // { id, promise }
  const spFragaSvarRootPathRef = useRef(null); // cached base path for FS-case uploads

  // Ref för ESC-hantering så att en enda lyssnare (registrerad vid första mount) alltid ser aktuellt tillstånd och körs före modalen
  const escStateRef = useRef({
    responsiblePickerVisible: false,
    externalPersonModalVisible: false,
    datePickerVisible: false,
    externalGroupMenuVisible: false,
    disciplineMenuVisible: false,
    byggdelMenuVisible: false,
    panelVisible: false,
    closePanel: () => {},
  });

  /** Vilken overlay som är öppen – sätts när användaren öppnar, rensas när den stängs. onRequestClose läser denna så att ESC bara stänger pickern. */
  const overlayOpenRef = useRef(null);

  const spResolvedSiteIdRef = useRef(null);
  const spResolvedProjectRootRef = useRef(null);

  const buildSharePointContext = (extra = null) => {
    const base = {
      companyId: safeText(companyId) || null,
      projectId: safeText(projectId) || null,
      siteId: safeText(spResolvedSiteIdRef.current || project?.sharePointSiteId) || null,
      sharePointRootPath: safeText(spResolvedProjectRootRef.current || project?.sharePointRootPath || project?.rootFolderPath) || null,
      rootFolderPath: safeText(project?.rootFolderPath) || null,
      projectName: safeText(project?.fullName || project?.projectName || project?.name) || null,
    };
    return { ...base, ...(extra && typeof extra === 'object' ? extra : {}) };
  };

  const reportSharePointFailure = (action, err, extraCtx = null) => {
    const msg = String(err?.message || err || 'Okänt fel');
    const ctx = buildSharePointContext(extraCtx);
    // eslint-disable-next-line no-console
    console.error(`[FragaSvarView][SharePoint] ${action} failed: ${msg}`, { ctx, err });
    setSharePointError(`${action}: ${msg}`);
  };

  const resolveProjectSiteId = async () => {
    const cached = safeText(spResolvedSiteIdRef.current);
    if (cached) return cached;

    const fromProject = safeText(project?.sharePointSiteId);
    if (fromProject) {
      spResolvedSiteIdRef.current = fromProject;
      return fromProject;
    }

    const siteUrl = safeText(project?.sharePointSiteUrl);
    if (siteUrl) {
      try {
        const u = new URL(siteUrl);
        const parts = String(u.pathname || '').split('/').filter(Boolean);
        const idx = parts.findIndex((p) => p === 'sites' || p === 'teams');
        const slug = idx >= 0 ? safeText(parts[idx + 1]) : safeText(parts[0]);
        if (slug) {
          const site = await getSiteByUrl(slug, u.hostname);
          if (site?.siteId) {
            spResolvedSiteIdRef.current = String(site.siteId);
            try {
              await patchCompanyProject(companyId, projectId, {
                sharePointSiteId: String(site.siteId),
                sharePointSiteUrl: String(site.webUrl || siteUrl),
              });
            } catch (_e) {}
            return String(site.siteId);
          }
        }
      } catch (e) {
        // fallthrough
      }
    }

    throw new Error('Projektets SharePoint-site saknas eller är felkonfigurerad.');
  };

  const resolveProjectRootFolderPath = async () => {
    const cached = safeText(spResolvedProjectRootRef.current);
    if (cached) return cached;

    const siteId = await resolveProjectSiteId();
    const existing = safeText(project?.sharePointRootPath || project?.rootFolderPath);
    if (existing) {
      try {
        const item = await getDriveItemByPath(existing, siteId);
        if (item?.folder) {
          const rel = String(existing || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
          spResolvedProjectRootRef.current = rel;
          return rel;
        }
      } catch (_e) {
        // ignore and try to derive
      }
    }

    const pn = safeText(project?.projectNumber) || safeText(projectId);
    const pnm = safeText(project?.projectName) || safeText(project?.name) || '';
    const fullName = safeText(project?.fullName) || formatSharePointProjectFolderName(pn, pnm);

    const derived = await resolveProjectRootFolderPathInSite({
      siteId,
      projectNumber: pn,
      projectName: pnm,
      fullName,
    });

    if (!derived) throw new Error('Projektets SharePoint-path saknas eller kan inte hittas.');

    // Persist only if the folder actually exists (resolver validates via Graph).
    spResolvedProjectRootRef.current = String(derived);
    try {
      await patchCompanyProject(companyId, projectId, {
        rootFolderPath: String(derived),
        sharePointRootPath: String(derived),
      });
    } catch (_e) {}

    return String(derived);
  };

  const answerInputRef = useRef(null);
  const focusAnswerOnOpenRef = useRef(false);

  useEffect(() => {
    if (!panelVisible) return;
    if (!focusAnswerOnOpenRef.current) return;
    focusAnswerOnOpenRef.current = false;
    const t = setTimeout(() => {
      try { answerInputRef.current?.focus?.(); } catch (_e) {}
    }, 80);
    return () => clearTimeout(t);
  }, [panelVisible]);

  const unsubRef = useRef(null);

  useEffect(() => {
    if (!hasContext) {
      setItems([]);
      setError('');
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError('');

    try {
      if (unsubRef.current) {
        try { unsubRef.current(); } catch (_e) {}
        unsubRef.current = null;
      }
      unsubRef.current = listenFragaSvarItems(
        companyId,
        projectId,
        (next) => {
          setItems(Array.isArray(next) ? next : []);
          setLoading(false);
        },
        (err) => {
          setError(String(err?.message || err || 'Kunde inte ladda Frågor & svar.'));
          setLoading(false);
        },
        { includeDeleted: !!showDeleted },
      );
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte starta lyssnare.'));
      setLoading(false);
    }

    return () => {
      if (unsubRef.current) {
        try { unsubRef.current(); } catch (_e) {}
        unsubRef.current = null;
      }
    };
  }, [companyId, projectId, hasContext, showDeleted]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetchByggdelar(companyId).then((list) => {
      if (!cancelled && Array.isArray(list)) setByggdelarList(list);
    }).catch(() => { if (!cancelled) setByggdelarList([]); });
    return () => { cancelled = true; };
  }, [companyId]);

  const filteredAndSorted = useMemo(() => {
    const q = safeText(search).toLowerCase();
    const list = Array.isArray(items) ? items : [];
    const filtered = list.filter((it) => {
      const itId = safeText(it?.id);
      if (!showDeleted) {
        if (it?.deleted === true) return false;
        if (itId && optimisticallyDeletedById?.[itId]) return false;
      }
      const itStatus = normalizeStatusValue(safeText(it?.status)) || 'Obesvarad';
      if (filterStatus !== 'Alla' && itStatus !== filterStatus) return false;
      if (!q) return true;
      const answerText = safeText(it?.answer) || safeText(it?.comment);
      const responsibles = normalizeResponsiblesFromItem(it);
      const responsibleHay = responsibles
        .map((r) => [r?.name, r?.email, r?.role, r?.groupTitle].map((v) => safeText(v)).filter(Boolean).join(' '))
        .filter(Boolean)
        .join(' | ');
      const hay = [
        it?.fsNumber,
        it?.title,
        it?.bd,
        displayDiscipline(it),
        it?.stalledTill,
        responsibleHay,
        it?.question,
        it?.status,
        answerText,
        it?.answeredByName,
        it?.createdByName,
        it?.needsAnswerBy,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' | ');
      return hay.includes(q);
    });

    const dir = sortDirection === 'desc' ? -1 : 1;
    const getVal = (it) => {
      if (sortColumn === 'bd') return normalizeBd(it?.bd);
      if (sortColumn === 'status') return safeText(it?.status);
      if (sortColumn === 'title') return Number(it?.fsSeq) || 0;
      if (sortColumn === 'discipline') return displayDiscipline(it);
      if (sortColumn === 'responsibles') {
        const list = normalizeResponsiblesFromItem(it);
        return safeText(list?.[0]?.name) || '';
      }
      // Backwards: older sort key name in UI
      if (sortColumn === 'stalledTill') {
        const list = normalizeResponsiblesFromItem(it);
        return safeText(list?.[0]?.name) || displayDiscipline(it);
      }
      if (sortColumn === 'needsAnswerBy') return normalizeDateYmd(it?.needsAnswerBy);
      if (sortColumn === 'question') return safeText(it?.question);
      if (sortColumn === 'answer') return safeText(it?.answer) || safeText(it?.comment);
      if (sortColumn === 'answeredAt') return toDateSafe(it?.answeredAt)?.getTime() || 0;
      if (sortColumn === 'createdAt') return toDateSafe(it?.createdAt)?.getTime() || 0;
      if (sortColumn === 'createdByName') return safeText(it?.createdByName) || '';
      if (sortColumn === 'answeredByName') return safeText(it?.answeredByName) || '';
      return safeText(it?.question);
    };

    return [...filtered].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [items, search, filterStatus, sortColumn, sortDirection, showDeleted, optimisticallyDeletedById]);

  // NOTE: We intentionally do not run any automatic Firestore migrations from effects.
  // Excel write-through is mutation-driven and must not be indirectly triggered by useEffect/listeners.

  const openDatePicker = (which) => {
    const t = which === 'form' ? 'form' : 'quick';
    setDatePickerTarget(t);
    overlayOpenRef.current = 'datePicker';
    setDatePickerVisible(true);
  };

  const openDisciplineMenu = (e, which) => {
    const forKey = which === 'form' ? 'form' : 'quick';
    setDisciplineMenuFor(forKey);

    if (Platform.OS !== 'web') {
      const actions = DISCIPLINE_CHOICES.map((d) => ({
        text: d,
        onPress: () => {
          if (forKey === 'form') setFormDiscipline(d);
          else setQuickDiscipline(d);
        },
      }));
      actions.push({ text: 'Avbryt', style: 'cancel' });
      Alert.alert('Disciplin', 'Välj disciplin', actions);
      return;
    }

    try {
      const ne = e?.nativeEvent || e;
      const x = Number(ne?.pageX ?? ne?.clientX ?? 20);
      const y = Number(ne?.pageY ?? ne?.clientY ?? 64);
      setDisciplineMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    } catch (_err) {
      setDisciplineMenuPos({ x: 20, y: 64 });
    }
    overlayOpenRef.current = 'discipline';
    setDisciplineMenuVisible(true);
  };

  const openByggdelMenu = (e, which) => {
    const forKey = which === 'form' ? 'form' : 'quick';
    setByggdelMenuFor(forKey);
    setByggdelPickerSearch('');
    if (Platform.OS !== 'web') {
      const actions = (Array.isArray(byggdelarList) ? byggdelarList : []).slice(0, 20).map((b) => {
        const code = String(b?.code ?? '').trim();
        const name = String(b?.name ?? '').trim();
        const label = name ? `${code} – ${name}` : code || '—';
        return { text: label, onPress: () => { if (forKey === 'form') setFormBd(code); else setQuickBd(code); } };
      });
      actions.push({ text: '— Ingen', onPress: () => { if (forKey === 'form') setFormBd(''); else setQuickBd(''); } });
      actions.push({ text: 'Avbryt', style: 'cancel' });
      Alert.alert('Byggdel', 'Välj byggdel', actions);
      return;
    }
    try {
      const ne = e?.nativeEvent || e;
      const x = Number(ne?.pageX ?? ne?.clientX ?? 20);
      const y = Number(ne?.pageY ?? ne?.clientY ?? 64);
      setByggdelMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    } catch (_err) {
      setByggdelMenuPos({ x: 20, y: 64 });
    }
    overlayOpenRef.current = 'byggdel';
    setByggdelMenuVisible(true);
  };

  const byggdelMenuItems = useMemo(() => {
    const selected = byggdelMenuFor === 'form' ? safeText(formBd) : safeText(quickBd);
    const emptyItem = { key: 'bd:empty', label: '— Ingen', value: '', isSelected: !selected, iconName: 'remove-outline', phaseColor: COLORS.blue };
    const list = (Array.isArray(byggdelarList) ? byggdelarList : []).map((b) => {
      const code = String(b?.code ?? '').trim();
      const name = String(b?.name ?? '').trim();
      const label = name ? `${code} – ${name}` : code || '—';
      return { key: `bd:${b?.id || code}`, label, value: code, isSelected: selected === code, iconName: 'cube-outline', phaseColor: COLORS.blue };
    });
    return [emptyItem, ...list];
  }, [byggdelMenuFor, formBd, quickBd, byggdelarList, COLORS.blue]);

  const filteredByggdelarForPicker = useMemo(() => {
    const list = Array.isArray(byggdelarList) ? byggdelarList : [];
    const q = safeText(byggdelPickerSearch).toLowerCase();
    if (!q) return list;
    return list.filter((b) => {
      const code = String(b?.code ?? '').toLowerCase();
      const name = String(b?.name ?? '').toLowerCase();
      const notes = String(b?.notes ?? '').toLowerCase();
      return code.includes(q) || name.includes(q) || notes.includes(q);
    });
  }, [byggdelarList, byggdelPickerSearch]);

  const disciplineMenuItems = useMemo(() => {
    const selected = disciplineMenuFor === 'form' ? normalizeDiscipline(formDiscipline) : normalizeDiscipline(quickDiscipline);
    return DISCIPLINE_CHOICES.map((d) => ({
      key: `disc:${d}`,
      label: d,
      value: d,
      isSelected: selected === d,
      iconName: 'pricetag-outline',
      phaseColor: COLORS.blue,
    }));
  }, [disciplineMenuFor, formDiscipline, quickDiscipline, COLORS.blue]);

  const normalizeEmail = (email) => safeText(email).trim().toLowerCase();

  const formatResponsibleSummary = (keys) => {
    const normalized = normalizeResponsibleKeys(keys);
    if (normalized.length === 0) return '';
    const names = normalized
      .map((k) => findResponsibleByKey(orgGroups, k))
      .map((r) => safeText(r?.member?.name))
      .filter(Boolean);
    if (names.length === 0) return 'Valda';
    return names.join(', ');
  };

  const openExternalGroupMenu = (e) => {
    if (Platform.OS !== 'web') {
      const groups = Array.isArray(orgGroups) ? orgGroups : [];
      const actions = [...groups]
        .filter(Boolean)
        .sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'sv'))
        .map((g) => ({
          text: safeText(g?.title) || 'Grupp',
          onPress: () => {
            setExternalPersonGroupId(safeText(g?.id));
            setExternalPersonCreatingGroup(false);
            setExternalPersonNewGroupTitle('');
          },
        }));
      actions.push({
        text: '+ Skapa ny grupp',
        onPress: () => {
          setExternalPersonGroupId('');
          setExternalPersonCreatingGroup(true);
          setExternalPersonNewGroupTitle('');
        },
      });
      actions.push({ text: 'Avbryt', style: 'cancel' });
      Alert.alert('Grupp', 'Välj grupp', actions);
      return;
    }

    try {
      const ne = e?.nativeEvent || e;
      const x = Number(ne?.pageX ?? ne?.clientX ?? 20);
      const y = Number(ne?.pageY ?? ne?.clientY ?? 64);
      setExternalGroupMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    } catch (_err) {
      setExternalGroupMenuPos({ x: 20, y: 64 });
    }
    overlayOpenRef.current = 'externalGroup';
    setExternalGroupMenuVisible(true);
  };

  const externalGroupMenuItems = useMemo(() => {
    const groups = Array.isArray(orgGroups) ? orgGroups : [];
    const selected = safeText(externalPersonGroupId);
    const sorted = [...groups]
      .filter(Boolean)
      .sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'sv'))
      .map((g) => ({
        key: `grp:${safeText(g?.id)}`,
        label: safeText(g?.title) || 'Grupp',
        value: safeText(g?.id),
        isSelected: safeText(g?.id) === selected,
        iconName: 'people-outline',
        phaseColor: COLORS.blue,
      }));

    sorted.push({
      key: 'grp:create',
      label: '+ Skapa ny grupp',
      value: '__create__',
      iconName: 'add-circle-outline',
      phaseColor: COLORS.blue,
    });

    return sorted;
  }, [orgGroups, externalPersonGroupId, COLORS.blue]);

  const openResponsiblePicker = (which) => {
    const forKey = which === 'form' ? 'form' : 'quick';
    setResponsiblePickerFor(forKey);
    setResponsiblePickerSearch('');
    overlayOpenRef.current = 'responsible';
    setResponsiblePickerVisible(true);
  };

  const setResponsibleKeysFor = (which, nextKeys) => {
    const normalized = normalizeResponsibleKeys(nextKeys);
    if (which === 'form') setFormResponsibleKeys(normalized);
    else setQuickResponsibleKeys(normalized);
  };

  const toggleResponsibleKeyFor = (which, key) => {
    const k = String(key || '').trim();
    if (!k) return;
    const current = which === 'form' ? normalizeResponsibleKeys(formResponsibleKeys) : normalizeResponsibleKeys(quickResponsibleKeys);
    if (current.includes(k)) {
      setResponsibleKeysFor(which, current.filter((x) => x !== k));
    } else {
      setResponsibleKeysFor(which, [...current, k]);
    }
  };

  const removeResponsibleKeyFor = (which, key) => {
    const k = String(key || '').trim();
    if (!k) return;
    const current = which === 'form' ? normalizeResponsibleKeys(formResponsibleKeys) : normalizeResponsibleKeys(quickResponsibleKeys);
    setResponsibleKeysFor(which, current.filter((x) => x !== k));
  };

  const filteredResponsibleGroups = useMemo(() => {
    const groups = Array.isArray(orgGroups) ? orgGroups : [];
    const q = safeText(responsiblePickerSearch).toLowerCase();
    // Interna gruppen (Organisation och roller: isInternalMainGroup) först, sedan beställare/övriga alfabetiskt
    const sortedGroups = [...groups]
      .filter(Boolean)
      .sort((a, b) => {
        const aIntern = !!a?.isInternalMainGroup;
        const bIntern = !!b?.isInternalMainGroup;
        if (aIntern && !bIntern) return -1;
        if (!aIntern && bIntern) return 1;
        return String(a?.title || '').localeCompare(String(b?.title || ''), 'sv');
      });

    if (!q) {
      return sortedGroups.map((g) => ({
        ...g,
        members: [...(Array.isArray(g?.members) ? g.members : [])]
          .filter(Boolean)
          .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'sv')),
      }));
    }

    return sortedGroups
      .map((g) => {
        const members = [...(Array.isArray(g?.members) ? g.members : [])]
          .filter(Boolean)
          .filter((m) => {
            const hay = [m?.name, m?.email, m?.role]
              .map((v) => safeText(v).toLowerCase())
              .join(' | ');
            return hay.includes(q);
          })
          .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'sv'));
        return { ...g, members };
      })
      .filter((g) => (Array.isArray(g?.members) ? g.members.length > 0 : false));
  }, [orgGroups, responsiblePickerSearch]);

  // När Ansvariga-modalen öppnas: initiera pending-nycklar från aktuella val + grupp-öppen (interna gruppen alltid öppen)
  useEffect(() => {
    if (!responsiblePickerVisible) return;
    const which = responsiblePickerFor === 'form' ? 'form' : 'quick';
    const current = normalizeResponsibleKeys(which === 'form' ? formResponsibleKeys : quickResponsibleKeys);
    setResponsiblePickerPendingKeys(current);
    const groups = Array.isArray(orgGroups) ? orgGroups : [];
    const nextOpen = {};
    groups.forEach((g) => {
      const gid = safeText(g?.id);
      nextOpen[gid] = !!g?.isInternalMainGroup;
    });
    setResponsibleGroupOpen(nextOpen);
  }, [responsiblePickerVisible, responsiblePickerFor, orgGroups]);

  // UX rule: after a new FS is created, the "Ny fråga" input state must be fully cleared.
  const resetQuickNewQuestion = () => {
    setQuickBd('');
    setQuickDiscipline('');
    setQuickResponsibleKeys([]);
    setQuickNeedsAnswerBy('');
    setQuickTitle('');
    setQuickQuestion('');
    setQuickFiles([]);
    setQuickUploadError('');
    setQuickAttemptedSubmit(false);
    setQuickQuestionHeight(74);
    try {
      if (quickFileInputRef.current && typeof quickFileInputRef.current.value !== 'undefined') {
        quickFileInputRef.current.value = '';
      }
    } catch (_e) {}
  };

  const isQuickFormDirty = () => {
    const bd = safeText(quickBd);
    const disc = safeText(quickDiscipline);
    const keys = Array.isArray(quickResponsibleKeys) ? quickResponsibleKeys : [];
    const needsBy = safeText(quickNeedsAnswerBy);
    const title = safeText(quickTitle);
    const question = safeText(quickQuestion);
    const files = Array.isArray(quickFiles) ? quickFiles : [];
    return !!(bd || disc || keys.length > 0 || needsBy || title || question || files.length > 0);
  };

  const handleToggleQuickPanel = () => {
    if (quickPanelOpen && isQuickFormDirty()) {
      const message = 'Du har fyllt i uppgifter som inte är sparade. Vill du stänga utan att spara? Allt du fyllt i kommer att tas bort.';
      if (Platform.OS === 'web') {
        if (window.confirm('Stäng ny fråga?\n\n' + message)) {
          resetQuickNewQuestion();
          setQuickPanelOpen(false);
        }
        return;
      }
      Alert.alert(
        'Stäng ny fråga?',
        message,
        [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Stäng', onPress: () => { resetQuickNewQuestion(); setQuickPanelOpen(false); } },
        ]
      );
      return;
    }
    setQuickPanelOpen((v) => !v);
  };

  const resetFormNewQuestion = () => {
    setFormBd('');
    setFormDiscipline('');
    setFormResponsibleKeys([]);
    setFormNeedsAnswerBy('');
    setFormTitle('');
    setFormQuestion('');
    setFormStatus('Obesvarad');
    setFormAnswer('');
    setFormAttachments([]);
    setFormStagedQuestionFiles([]);
    setFormStagedAnswerFiles([]);
    setFormAnswersHistory([]);
    setFormSharePointFolderPath(null);
    setUploadError('');
    setQuestionInputHeight(72);
    setAnswerInputHeight(110);
    try {
      if (questionFileInputRef.current && typeof questionFileInputRef.current.value !== 'undefined') {
        questionFileInputRef.current.value = '';
      }
    } catch (_e) {}
    try {
      if (answerFileInputRef.current && typeof answerFileInputRef.current.value !== 'undefined') {
        answerFileInputRef.current.value = '';
      }
    } catch (_e) {}
  };

  const waitForItemToAppear = async (id, { timeoutMs = 12000 } = {}) => {
    const targetId = safeText(id);
    if (!targetId) return false;
    const started = Date.now();

    // Poll (simple + robust). Listener updates async; we want to keep the UI in a clear "saving" state.
    // Resolve true when item is present; false on timeout.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const arr = itemsRef.current;
      const found = Array.isArray(arr) && arr.some((x) => safeText(x?.id) === targetId);
      if (found) return true;
      if (Date.now() - started > Math.max(2000, Number(timeoutMs) || 12000)) return false;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 160));
    }
  };

  const createQuick = async () => {
    if (!hasContext) return;
    setQuickAttemptedSubmit(true);
    if (quickSaving) return;

    const title = safeText(quickTitle);
    const question = safeText(quickQuestion);
    const discipline = normalizeDiscipline(quickDiscipline) || 'Intern';
    if (!title || !question) return;

    setQuickSaving(true);
    setError('');

    try {
      const user = auth?.currentUser;
      const assignedMeta = {
        assignedAt: new Date().toISOString(),
        assignedByUid: user?.uid || null,
        assignedByName: safeText(user?.displayName) || safeText(user?.email) || null,
      };
      const responsibles = resolveResponsiblesByKeys(orgGroups, quickResponsibleKeys, assignedMeta);
      const responsible = responsibles[0] || null;

      const payload = {
        title,
        bd: normalizeBd(quickBd),
        discipline,
        // Backwards compatibility: legacy field name
        stalledTill: discipline,
        responsibles,
        responsible,
        needsAnswerBy: normalizeDateYmd(quickNeedsAnswerBy),
        question,
        status: 'Obesvarad',
        answer: '',
        // Upload staged files only after we have created the FS folder
        attachments: [],
      };

      const created = await createFragaSvarItem(companyId, projectId, payload);

      // Create/ensure SharePoint folder for this FS and upload files into it
      try {
        const siteId = await resolveProjectSiteId();

        const rootFsPath = await resolveFragaSvarRootPath();
        const fsNumber = formatFsNumberFromItem(created) || 'FS';
        const createdTitle = safeText(created?.title) || title || deriveTitleFromText(question);
        const folderName = sanitizeSharePointFolderName(`${fsNumber} – ${createdTitle || 'Ärende'}`) || `${fsNumber}`;
        const folderPath = `${rootFsPath}/${folderName}`;

        await ensureFolderPath(folderPath, safeText(companyId), siteId, { siteRole: 'projects', strict: true });

        await updateFragaSvarItem(companyId, projectId, created?.id, {
          sharePointFolderPath: folderPath,
          sharePointFolderName: folderName,
        });

        const staged = uniqFiles(quickFiles);
        if (staged.length > 0) {
          setQuickUploadingFiles(true);
          setQuickUploadError('');
          const uploaded = [];

          for (const file of staged) {
            if (!file) continue;
            const originalName = safeText(file?.name) || `fil_${Date.now()}`;
            const safeName = originalName.replace(/[^a-zA-Z0-9._\-\s()ÅÄÖåäö]/g, '_');
            const stampedName = `${Date.now()}_${safeName}`;
            const path = `${folderPath}/${stampedName}`;

            const webUrl = await uploadFile({
              file,
              path,
              companyId: safeText(companyId),
              siteId,
              siteRole: 'projects',
              strictEnsure: true,
            });

            uploaded.push({
              name: originalName,
              webUrl,
              fileType: fileTypeFromName(originalName) || null,
              addedAt: new Date().toISOString(),
              addedByUid: user?.uid || null,
              addedByName: user?.displayName || user?.email || null,
              attachedIn: 'question',
            });
          }

          if (uploaded.length > 0) {
            await updateFragaSvarItem(companyId, projectId, created?.id, {
              attachments: uniqAttachments(uploaded),
            });
          }
        }
      } catch (spErr) {
        // Creation should still succeed even if SharePoint folder/upload fails
        reportSharePointFailure('Kunde inte skapa FS-mapp i SharePoint', spErr, {
          fsId: safeText(created?.id) || null,
          fsNumber: safeText(created?.fsNumber) || null,
        });
        setQuickUploadError('Kunde inte skapa mapp i SharePoint. Ärendet är skapat, men bilagor är spärrade tills SharePoint fungerar.');
      } finally {
        setQuickUploadingFiles(false);
      }

      // Wait until the new FS is visible in the table.
      try {
        await waitForItemToAppear(created?.id, { timeoutMs: 12000 });
      } catch (_e) {}

      // Company activity = notifications (dashboard).
      try {
        const targets = extractProjectParticipantUids(project);
        await logCompanyActivity({
          type: 'kalkyl_fraga_created',
          uid: user?.uid || null,
          email: user?.email || null,
          displayName: user?.displayName || null,
          projectId: safeText(projectId),
          projectName: safeText(project?.name),
          phaseKey: 'kalkylskede',
          entity: 'fragaSvar',
          entityId: created?.id || null,
          bd: normalizeBd(quickBd),
          discipline,
          stalledTill: discipline,
          needsAnswerBy: normalizeDateYmd(quickNeedsAnswerBy),
          question,
          status: 'Obesvarad',
          fsNumber: safeText(created?.fsNumber) || null,
          title: safeText(created?.title) || (safeText(quickTitle) || null),
          responsibleName: safeText(responsible?.name) || null,
          responsibleEmail: safeText(responsible?.email) || null,
          responsibleRole: safeText(responsible?.role) || null,
          responsiblesCount: responsibles.length,
          targets,
        }, companyId);
      } catch (_e) {}

      resetQuickNewQuestion();
      setQuickPanelOpen(false);
      try {
        if (quickQuestionRef.current && typeof quickQuestionRef.current.focus === 'function') {
          quickQuestionRef.current.focus();
        }
      } catch (_e) {}
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte skapa fråga.'));
    } finally {
      setQuickSaving(false);
    }
  };

  const openStatusMenu = (e) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Statusfilter', 'Välj status', [
        { text: 'Alla', onPress: () => setFilterStatus('Alla') },
        ...STATUSES.map((s) => ({ text: displayStatusLabel(s), onPress: () => setFilterStatus(s) })),
        { text: 'Avbryt', style: 'cancel' },
      ]);
      return;
    }

    try {
      const ne = e?.nativeEvent || e;
      const x = Number(ne?.pageX ?? ne?.clientX ?? 20);
      const y = Number(ne?.pageY ?? ne?.clientY ?? 64);
      setStatusMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    } catch (_err) {
      setStatusMenuPos({ x: 20, y: 64 });
    }
    setStatusMenuVisible(true);
  };

  const statusMenuItems = useMemo(() => {
    const choices = ['Alla', ...STATUSES];
    return choices.map((s) => ({
      key: `status:${s}`,
      label: s === 'Alla' ? 'Alla' : displayStatusLabel(s),
      value: s,
      isSelected: filterStatus === s,
      iconName: s === 'Alla' ? 'funnel-outline' : 'flag-outline',
      phaseColor: COLORS.blue,
    }));
  }, [filterStatus]);

  const stopPressPropagation = (e) => {
    try { e?.stopPropagation?.(); } catch (_e) {}
    try { e?.preventDefault?.(); } catch (_e) {}
  };

  const setItemStatus = async (it, nextStatus) => {
    if (!hasContext) return;
    const id = safeText(it?.id);
    const s = normalizeStatusValue(nextStatus);
    if (!id || !STATUSES.includes(s)) return;
    try {
      await updateFragaSvarItem(companyId, projectId, id, { status: s });
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte uppdatera status.'));
    }
  };

  const openRowStatusMenu = (e, it) => {
    stopPressPropagation(e);
    const id = safeText(it?.id);
    if (!id) return;
    setRowStatusTarget(it);

    if (Platform.OS !== 'web') {
      Alert.alert('Status', 'Välj status', [
        ...STATUSES.map((s) => ({
          text: displayStatusLabel(s),
          onPress: () => setItemStatus(it, s),
        })),
        { text: 'Avbryt', style: 'cancel' },
      ]);
      return;
    }

    try {
      const ne = e?.nativeEvent || e;
      const x = Number(ne?.pageX ?? ne?.clientX ?? 20);
      const y = Number(ne?.pageY ?? ne?.clientY ?? 64);
      setRowStatusMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    } catch (_err) {
      setRowStatusMenuPos({ x: 20, y: 64 });
    }
    setRowStatusMenuVisible(true);
  };

  const rowStatusMenuItems = useMemo(() => {
    const selected = normalizeStatusValue(safeText(rowStatusTarget?.status)) || 'Obesvarad';
    return STATUSES.map((s) => ({
      key: `rowStatus:${safeText(rowStatusTarget?.id) || 'x'}:${s}`,
      label: displayStatusLabel(s),
      value: s,
      isSelected: selected === s,
      iconName: 'flag-outline',
      phaseColor: COLORS.blue,
    }));
  }, [rowStatusTarget]);

  const toggleSort = (col) => {
    setSortColumn((prev) => {
      if (prev === col) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDirection('asc');
      return col;
    });
  };

  const addQuickFiles = (files) => {
    const arr = Array.isArray(files) ? files : [];
    if (arr.length === 0) return;
    setQuickUploadError('');
    setQuickFiles((prev) => uniqFiles([...(Array.isArray(prev) ? prev : []), ...arr]));
  };

  const removeQuickFile = (key) => {
    const target = safeText(key);
    if (!target) return;
    setQuickFiles((prev) => (Array.isArray(prev) ? prev.filter((f) => fileKey(f) !== target) : prev));
  };

  const addFormStagedQuestionFiles = (files) => {
    const arr = Array.isArray(files) ? files : [];
    if (arr.length === 0) return;
    setUploadError('');
    setFormStagedQuestionFiles((prev) => uniqFiles([...(Array.isArray(prev) ? prev : []), ...arr]));
  };

  const removeFormStagedQuestionFile = (key) => {
    const target = safeText(key);
    if (!target) return;
    setFormStagedQuestionFiles((prev) => (Array.isArray(prev) ? prev.filter((f) => fileKey(f) !== target) : prev));
  };

  const addFormStagedAnswerFiles = (files) => {
    const arr = Array.isArray(files) ? files : [];
    if (arr.length === 0) return;
    setUploadError('');
    setFormStagedAnswerFiles((prev) => uniqFiles([...(Array.isArray(prev) ? prev : []), ...arr]));
  };

  const removeFormStagedAnswerFile = (key) => {
    const target = safeText(key);
    if (!target) return;
    setFormStagedAnswerFiles((prev) => (Array.isArray(prev) ? prev.filter((f) => fileKey(f) !== target) : prev));
  };

  const backfillSharePointFolders = async () => {
    if (!hasContext) return;
    if (Platform.OS !== 'web') {
      Alert.alert('Backfill mappar', 'Backfill körs från webben (SharePoint/Graph).');
      return;
    }

    let siteId;
    try {
      siteId = await resolveProjectSiteId();
    } catch (e) {
      reportSharePointFailure('SharePoint-synk misslyckades. Projektets SharePoint-site saknas', e);
      Alert.alert('Backfill mappar', String(e?.message || e || 'Projektet saknar SharePoint siteId.'));
      return;
    }

    if (backfillRunning) return;

    const list = (Array.isArray(items) ? items : []);
    const missing = list.filter((it) => !safeText(it?.sharePointFolderPath));
    if (missing.length === 0) {
      Alert.alert('Backfill mappar', 'Alla FS har redan mappar kopplade.');
      return;
    }

    const ok = await confirmWebOrNative(`Skapa mappar för ${missing.length} befintliga FS?`);
    if (!ok) return;

    setBackfillRunning(true);
    setBackfillInfo('Startar…');
    setError('');

    let success = 0;
    let skipped = 0;
    const failed = [];

    try {
      const rootFsPath = await resolveFragaSvarRootPath();

      for (let i = 0; i < missing.length; i++) {
        const it = missing[i];
        const id = safeText(it?.id);
        if (!id) continue;

        const fsNumber = formatFsNumberFromItem(it);
        const title = safeText(it?.title) || deriveTitleFromText(it?.question);
        if (!fsNumber || !title) {
          skipped += 1;
          continue;
        }
        const folderName = sanitizeSharePointFolderName(`${fsNumber} – ${title || 'Ärende'}`) || `${fsNumber}`;
        const folderPath = `${rootFsPath}/${folderName}`;

        setBackfillInfo(`Skapar ${i + 1}/${missing.length}: ${fsNumber}`);

        try {
          await ensureFolderPath(folderPath, safeText(companyId), siteId, { siteRole: 'projects', strict: true });

          const patch = {
            sharePointFolderPath: folderPath,
            sharePointFolderName: folderName,
          };
          if (!safeText(it?.title) && title) patch.title = title;

          await updateFragaSvarItem(companyId, projectId, id, patch);
          success += 1;
        } catch (e) {
          reportSharePointFailure('Backfill: kunde inte skapa FS-mapp i SharePoint', e, {
            fsId: id,
            fsNumber,
            folderPath,
          });
          failed.push({ fsNumber, id, message: String(e?.message || e || 'okänt fel') });
        }
      }
    } catch (e) {
      setError(String(e?.message || e || 'Backfill misslyckades.'));
    } finally {
      setBackfillRunning(false);
      setBackfillInfo('');
    }

    if (failed.length === 0) {
      Alert.alert('Backfill mappar', `Klart! Skapade ${success} mappar.${skipped ? ` Hoppade över ${skipped}.` : ''}`);
    } else {
      Alert.alert('Backfill mappar', `Klart med fel. Skapade ${success}, misslyckades ${failed.length}.${skipped ? ` Hoppade över ${skipped}.` : ''} Se konsolen för detaljer.`);
      // eslint-disable-next-line no-console
      console.warn('[FragaSvarView] Backfill failures:', failed);
    }
  };

  const openNewQuestion = () => {
    resetFormNewQuestion();
    setEditingId(null);
    setSelectedRowId(null);
    setPanelVisible(true);
  };

  const isFormDirtyModal = () => {
    const bd = safeText(formBd);
    const disc = safeText(formDiscipline);
    const keys = Array.isArray(formResponsibleKeys) ? formResponsibleKeys : [];
    const needsBy = safeText(formNeedsAnswerBy);
    const title = safeText(formTitle);
    const question = safeText(formQuestion);
    const staged = Array.isArray(formStagedQuestionFiles) ? formStagedQuestionFiles : [];
    const attachments = Array.isArray(formAttachments) ? formAttachments : [];
    return !!(bd || disc || keys.length > 0 || needsBy || title || question || staged.length > 0 || attachments.length > 0);
  };

  const openEdit = (it, opts = {}) => {
    if (!it) return;
    setSelectedRowId(String(it?.id || '').trim() || null);
    setEditingId(String(it?.id || '').trim() || null);
    setFormBd(normalizeBd(it?.bd));
    setFormNeedsAnswerBy(normalizeDateYmd(it?.needsAnswerBy));
    setFormDiscipline(displayDiscipline(it) || 'Intern');
    setFormResponsibleKeys(
      normalizeResponsiblesFromItem(it)
        .map((r) => responsibleKey(r?.groupId, r?.memberId))
        .filter(Boolean),
    );
    setFormTitle(safeText(it?.title) || deriveTitleFromText(it?.question));
    setFormQuestion(safeText(it?.question));
    setFormStatus(normalizeStatusValue(safeText(it?.status)) || 'Obesvarad');

    const a = safeText(it?.answer) || safeText(it?.comment);
    originalAnswerRef.current = a;
    setFormAnswer(a);

    setFormAttachments(uniqAttachments(Array.isArray(it?.attachments) ? it.attachments : []));
    setFormAnswersHistory(Array.isArray(it?.answers) ? it.answers : []);
    setFormSharePointFolderPath(safeText(it?.sharePointFolderPath) || null);
    setPanelVisible(true);

    if (opts?.focusAnswer) {
      focusAnswerOnOpenRef.current = true;
    }

    if (Platform.OS === 'web') {
      // Best-effort self-heal: ensure project root + FS folder linkage on open.
      try {
        void ensureFolderPathForItem(it).catch((e) => {
          reportSharePointFailure('Kunde inte självläka FS-mapp i SharePoint', e, { fsId: safeText(it?.id) || null });
        });
      } catch (_e) {}

      // Live-sync folder contents for accurate file list + preview URLs
      try {
        refreshFilesForItem(it);
      } catch (_e) {}
    }
  };

  const openAnswer = (it) => {
    openEdit(it, { focusAnswer: true });
  };

  const openPreview = async ({ name, webUrl, downloadUrl }) => {
    const fileName = safeText(name);
    // Preview should prefer SharePoint web URL (viewer) to avoid auto-download.
    const url = safeText(webUrl) || safeText(downloadUrl);
    if (!url) {
      setError('Kunde inte öppna filen (saknar URL).');
      return;
    }

    // Web: open directly in a new tab (no intermediate modal/confirm).
    if (Platform.OS === 'web') {
      try {
        const w = window?.open?.(url, '_blank', 'noopener,noreferrer');
        if (!w) throw new Error('Popup blocked');
        return;
      } catch (e) {
        setError(`Kunde inte öppna filen${fileName ? ` \"${fileName}\"` : ''}. Tillåt popup-fönster för att öppna bilagor.`);
        return;
      }
    }

    // Native fallback: keep existing in-app preview.
    const { kind } = classifyFileType(fileName);
    setPreviewName(fileName || 'Fil');
    setPreviewUrl(url);
    setPreviewKind(kind);
    setPreviewVisible(true);
  };

  const openDownload = async ({ name, webUrl, downloadUrl }) => {
    const fileName = safeText(name);
    const url = safeText(downloadUrl) || safeText(webUrl);
    if (!url) {
      setError('Kunde inte ladda ner filen (saknar URL).');
      return;
    }

    if (Platform.OS === 'web') {
      try {
        const w = window?.open?.(url, '_blank', 'noopener,noreferrer');
        if (!w) throw new Error('Popup blocked');
        return;
      } catch (_e) {
        setError(`Kunde inte ladda ner filen${fileName ? ` \"${fileName}\"` : ''}. Tillåt popup-fönster för att ladda ner bilagor.`);
        return;
      }
    }

    try {
      const can = await Linking.canOpenURL(url).catch(() => false);
      if (can) await Linking.openURL(url);
    } catch (_e) {
      setError(`Kunde inte ladda ner filen${fileName ? ` \"${fileName}\"` : ''}.`);
    }
  };

  const openPreviewForLocalFile = (file) => {
    if (Platform.OS !== 'web') return;
    if (!file) return;
    const name = safeText(file?.name) || 'Fil';
    try {
      const url = URL.createObjectURL(file);
      const w = window?.open?.(url, '_blank', 'noopener');
      if (!w) throw new Error('Popup blocked');

      // Delay revoke to avoid breaking the newly opened tab while it loads.
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (_e) {}
      }, 2 * 60 * 1000);
    } catch (_e) {
      setError(`Kunde inte öppna filen${name ? ` \"${name}\"` : ''}.`);
    }
  };

  const closePreview = () => {
    setPreviewVisible(false);

    try {
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
        previewBlobUrlRef.current = null;
      }
    } catch (_e) {}

    setPreviewUrl('');
    setPreviewName('');
    setPreviewKind('file');
  };

  const handleSave = async () => {
    if (!hasContext) return;
    if (saving) return;
    const creatingNew = !editingId;
    const title = safeText(formTitle);
    const question = safeText(formQuestion);
    const discipline = normalizeDiscipline(formDiscipline) || 'Intern';
    if (!title) {
      setError('Rubrik är obligatorisk.');
      return;
    }
    if (!question) {
      setError('Fråga/Beskrivning är obligatorisk.');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const answer = safeText(formAnswer);
      const user = auth?.currentUser;
      const assignedMeta = {
        assignedAt: new Date().toISOString(),
        assignedByUid: user?.uid || null,
        assignedByName: safeText(user?.displayName) || safeText(user?.email) || null,
      };
      const responsibles = resolveResponsiblesByKeys(orgGroups, formResponsibleKeys, assignedMeta);
      const responsible = responsibles[0] || null;

      const payload = {
        title,
        bd: normalizeBd(formBd),
        needsAnswerBy: normalizeDateYmd(formNeedsAnswerBy),
        discipline,
        // Backwards compatibility: legacy field name
        stalledTill: discipline,
        responsibles,
        responsible,
        question,
        status: STATUSES.includes(normalizeStatusValue(formStatus)) ? normalizeStatusValue(formStatus) : 'Obesvarad',
        answer,
        attachments: uniqAttachments(formAttachments),
      };

      if (editingId) {
        await updateFragaSvarItem(companyId, projectId, editingId, payload);

        // Best-effort: ensure the FS folder exists when saving/answering existing FS.
        try {
          const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(editingId));
          if (current) {
            const ensured = await ensureFolderPathForItem(current);
            if (safeText(ensured)) {
              if (sharePointError) setSharePointError('');
            }
          }
        } catch (e) {
          reportSharePointFailure('Kunde inte säkerställa FS-mapp i SharePoint', e, { fsId: safeText(editingId) || null });
        }

        // Notify newly assigned responsible persons via dashboard notification
        try {
          const currentItem = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(editingId));
          const prevKeys = new Set(
            normalizeResponsiblesFromItem(currentItem)
              .map((r) => safeText(r?.memberId))
              .filter(Boolean),
          );
          const newUserIds = responsibles
            .map((r) => safeText(r?.memberId))
            .filter((uid) => uid && !prevKeys.has(uid));
          if (newUserIds.length > 0) {
            const fsNum = formatFsNumberFromItem(currentItem) || '';
            await createFsAssignmentNotification(companyId, projectId, {
              fsId: editingId,
              fsNumber: fsNum,
              fsTitle: title,
              assignedUserIds: newUserIds,
              authorId: user?.uid || '',
              authorName: safeText(user?.displayName) || safeText(user?.email) || 'Användare',
            });
          }
        } catch (_e) {}

        // If answer was added/changed to non-empty, emit activity (notifications)
        const prevAnswer = safeText(originalAnswerRef.current);
        if (answer && answer !== prevAnswer) {
          try {
            const targets = extractProjectParticipantUids(project);
            await logCompanyActivity({
              type: 'kalkyl_fraga_answered',
              uid: user?.uid || null,
              email: user?.email || null,
              displayName: user?.displayName || null,
              projectId: safeText(projectId),
              projectName: safeText(project?.name),
              phaseKey: 'kalkylskede',
              entity: 'fragaSvar',
              entityId: editingId,
              bd: normalizeBd(formBd),
              discipline,
              stalledTill: discipline,
              responsibleName: safeText(responsible?.name) || null,
              responsibleEmail: safeText(responsible?.email) || null,
              responsibleRole: safeText(responsible?.role) || null,
              responsiblesCount: responsibles.length,
              question,
              status: STATUSES.includes(normalizeStatusValue(formStatus)) ? normalizeStatusValue(formStatus) : 'Obesvarad',
              targets,
            }, companyId);
          } catch (_e) {}
        }

      } else {
        const created = await createFragaSvarItem(companyId, projectId, payload);

        // Create/ensure SharePoint folder for this FS immediately on create
        let spErr = null;
        try {
          const siteId = await resolveProjectSiteId();
          if (siteId && safeText(created?.id)) {
            const rootFsPath = await resolveFragaSvarRootPath();
            const fsNumber = formatFsNumberFromItem(created) || 'FS';
            const createdTitle = safeText(created?.title) || safeText(payload?.title) || deriveTitleFromText(question);
            const folderName = sanitizeSharePointFolderName(`${fsNumber} – ${createdTitle || 'Ärende'}`) || `${fsNumber}`;
            const folderPath = `${rootFsPath}/${folderName}`;

            await ensureFolderPath(folderPath, safeText(companyId), siteId, { siteRole: 'projects', strict: true });
            await updateFragaSvarItem(companyId, projectId, created.id, {
              sharePointFolderPath: folderPath,
              sharePointFolderName: folderName,
            });

            // If user attached files before saving, upload them now into the FS folder
            const stagedQ = uniqFiles(formStagedQuestionFiles);
            const stagedA = uniqFiles(formStagedAnswerFiles);
            const staged = [
              ...stagedQ.map((f) => ({ file: f, attachedIn: 'question' })),
              ...stagedA.map((f) => ({ file: f, attachedIn: 'answer' })),
            ];
            if (staged.length > 0) {
              setUploadingFiles(true);
              setUploadError('');

              const user = auth?.currentUser;
              const uploaded = [];

              for (const entry of staged) {
                const file = entry?.file;
                if (!file) continue;
                const attachCtx = normalizeAttachedIn(entry?.attachedIn);
                const originalName = safeText(file?.name) || `fil_${Date.now()}`;
                const safeName = originalName.replace(/[^a-zA-Z0-9._\-\s()ÅÄÖåäö]/g, '_');
                const stampedName = `${Date.now()}_${safeName}`;
                const path = `${folderPath}/${stampedName}`;

                const webUrl = await uploadFile({
                  file,
                  path,
                  companyId: safeText(companyId),
                  siteId,
                  siteRole: 'projects',
                  strictEnsure: true,
                });

                uploaded.push({
                  name: originalName,
                  webUrl,
                  fileType: fileTypeFromName(originalName) || null,
                  addedAt: new Date().toISOString(),
                  addedByUid: user?.uid || null,
                  addedByName: user?.displayName || user?.email || null,
                  attachedIn: attachCtx,
                });
              }

              if (uploaded.length > 0) {
                await updateFragaSvarItem(companyId, projectId, created.id, {
                  attachments: uniqAttachments(uploaded),
                });
              }

              setFormStagedQuestionFiles([]);
              setFormStagedAnswerFiles([]);
              try {
                await refreshFilesForItem({ ...created, sharePointFolderPath: folderPath });
              } catch (_e) {}
            }
          }
        } catch (e) {
          spErr = e;
        }
        finally {
          setUploadingFiles(false);
        }

        // If SharePoint folder creation/upload failed, keep the modal open in edit mode.
        if (spErr) {
          reportSharePointFailure('Kunde inte skapa mapp / ladda upp filer i SharePoint', spErr, {
            fsId: safeText(created?.id) || null,
            fsNumber: safeText(created?.fsNumber) || null,
          });
          setUploadError(String(spErr?.message || spErr || 'Kunde inte skapa mapp / ladda upp filer.'));
          setEditingId(created?.id || null);
          setSelectedRowId(created?.id || null);
          originalAnswerRef.current = safeText(answer);
          // Keep panel open so user can retry.
          setSaving(false);
          return;
        }

        // Wait until the new FS is visible in the table.
        try {
          await waitForItemToAppear(created?.id, { timeoutMs: 12000 });
        } catch (_e) {}

        try {
          const targets = extractProjectParticipantUids(project);
          await logCompanyActivity({
            type: 'kalkyl_fraga_created',
            uid: user?.uid || null,
            email: user?.email || null,
            displayName: user?.displayName || null,
            projectId: safeText(projectId),
            projectName: safeText(project?.name),
            phaseKey: 'kalkylskede',
            entity: 'fragaSvar',
            entityId: created?.id || null,
            bd: normalizeBd(formBd),
            discipline,
            stalledTill: discipline,
            question,
            status: STATUSES.includes(normalizeStatusValue(formStatus)) ? normalizeStatusValue(formStatus) : 'Obesvarad',
            fsNumber: safeText(created?.fsNumber) || null,
            title: safeText(created?.title) || (safeText(payload?.title) || null),
            responsibleName: safeText(responsible?.name) || null,
            responsibleEmail: safeText(responsible?.email) || null,
            responsibleRole: safeText(responsible?.role) || null,
            responsiblesCount: responsibles.length,
            targets,
          }, companyId);
        } catch (_e) {}

        // Notify assigned responsible persons for new items
        try {
          const newUserIds = responsibles
            .map((r) => safeText(r?.memberId))
            .filter(Boolean);
          if (newUserIds.length > 0 && created?.id) {
            const fsNum = formatFsNumberFromItem(created) || '';
            await createFsAssignmentNotification(companyId, projectId, {
              fsId: created.id,
              fsNumber: fsNum,
              fsTitle: title,
              assignedUserIds: newUserIds,
              authorId: user?.uid || '',
              authorName: safeText(user?.displayName) || safeText(user?.email) || 'Användare',
            });
          }
        } catch (_e) {}
      }

      setPanelVisible(false);
      setEditingId(null);
      setSelectedRowId(null);
      if (creatingNew) resetFormNewQuestion();
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte spara.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (it) => {
    if (!hasContext) return;
    // Prevent race condition when deleting FS items: block new delete while one is in progress
    if (deletingFsId) return;
    const ok = await confirmWebOrNative(
      'Är du säker på att du vill radera denna fråga?\n\nDetta tar bort frågan, tillhörande mappar och Excel-logg och kan inte ångras.'
    );
    if (!ok) return;
    const deletedId = String(it?.id || '').trim();
    const item = deletedId ? (items.find((i) => String(i?.id) === deletedId) || it) : it;
    setDeletingFsId(deletedId);
    const deleteStartedAt = Date.now();
    const MIN_DELETE_LOADING_MS = 500; // Säkerställ att "Raderar…" alltid syns minst en kort stund
    // Ge React och webbläsaren tid att rita "Raderar…" innan vi startar async-jobbet (annars kan raden försvinna innan nästa paint)
    await new Promise((r) => setTimeout(r, 120));
    try {
      // 1. Ta bort FS-dokumentet i Firestore (Excel-loggen uppdateras via kö)
      await deleteFragaSvarItem(companyId, projectId, deletedId);

      // 2. Excel uppdateras asynkront av deleteFragaSvarItem (enqueueFsExcelSync)

      // 3. Ta bort FS-mappen i FrågaSvar
      const folderPath = safeText(item?.sharePointFolderPath);
      if (folderPath) {
        try {
          const siteId = await resolveProjectSiteId();
          await deleteFile(folderPath, safeText(companyId), siteId);
        } catch (folderErr) {
          const msg = String(folderErr?.message || folderErr || '').toLowerCase();
          const is404 = msg.includes('404') || folderErr?.status === 404 || folderErr?.response?.status === 404;
          if (is404) {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[FS delete] Mappen hittades inte (404), fortsätter:', folderPath);
            }
          } else {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[FS delete] Kunde inte ta bort mapp, fortsätter:', folderErr?.message || folderErr);
            }
          }
        }
      }

      // 4. Uppdatera numrering/metadata (stäng glappet)
      const remaining = await getFragaSvarItemsOnce(companyId, projectId);
      const renumbers = [];
      for (let i = 0; i < remaining.length; i += 1) {
        const newSeq = i + 1;
        const rem = remaining[i];
        const currentSeq = Number(rem?.fsSeq) || 0;
        if (currentSeq !== newSeq) {
          renumbers.push({
            item: rem,
            newSeq,
            newFsNumber: `FS${String(newSeq).padStart(2, '0')}`,
          });
        }
      }
      renumbers.sort((a, b) => (Number(b?.item?.fsSeq) || 0) - (Number(a?.item?.fsSeq) || 0));
      if (renumbers.length > 0) {
        const siteId = await resolveProjectSiteId();
        const rootFsPath = await resolveFragaSvarRootPath();
        let projectRootPath;
        try {
          projectRootPath = await resolveProjectRootFolderPath();
        } catch (_e) {
          projectRootPath = '';
        }
        for (const { item: renumItem, newSeq, newFsNumber } of renumbers) {
          const title = safeText(renumItem?.title) || deriveTitleFromText(renumItem?.question) || 'Ärende';
          const newFolderName = sanitizeSharePointFolderName(`${newFsNumber} – ${title}`) || newFsNumber;
          const currentPath = safeText(renumItem?.sharePointFolderPath);
          if (currentPath) {
            try {
              const driveItem = await getDriveItemByPath(currentPath, siteId);
              if (driveItem?.id) {
                await renameDriveItemByIdGuarded({
                  siteId,
                  itemId: driveItem.id,
                  newName: newFolderName,
                  projectRootPath: projectRootPath || undefined,
                  itemPath: currentPath,
                });
              }
            } catch (folderErr) {
              const msg = String(folderErr?.message || folderErr || '').toLowerCase();
              const is404 = msg.includes('404') || folderErr?.status === 404;
              if (!is404 && typeof console !== 'undefined' && console.warn) {
                console.warn('[FS renumber] Kunde inte byta mappnamn, uppdaterar endast Firestore:', currentPath, folderErr?.message || folderErr);
              }
            }
          }
          const newPath = rootFsPath ? `${rootFsPath}/${newFolderName}` : newFolderName;
          await updateFragaSvarItem(companyId, projectId, renumItem.id, {
            fsSeq: newSeq,
            fsNumber: newFsNumber,
            sharePointFolderPath: newPath,
            sharePointFolderName: newFolderName,
          });
        }
        await setFragaSvarNextFsSeq(companyId, projectId, remaining.length + 1);
      } else if (remaining.length === 0) {
        await setFragaSvarNextFsSeq(companyId, projectId, 1);
      }

      // Säkerställ att "Raderar…" syns minst MIN_DELETE_LOADING_MS (annars kan det kännas som att inget hände)
      const elapsed = Date.now() - deleteStartedAt;
      if (elapsed < MIN_DELETE_LOADING_MS) {
        await new Promise((r) => setTimeout(r, MIN_DELETE_LOADING_MS - elapsed));
      }

      // UI uppdateras först när alla steg lyckats
      if (deletedId) {
        setOptimisticallyDeletedById((prev) => ({ ...(prev || {}), [deletedId]: true }));
      }
      if (deletedId === String(selectedRowId || '').trim()) {
        setPanelVisible(false);
        setEditingId(null);
        setSelectedRowId(null);
      }
      setError('');
      Alert.alert('Klart', 'Frågan har raderats');
    } catch (e) {
      const msg = String(e?.message || e || 'Kunde inte ta bort.');
      setError(msg);
      Alert.alert('Kunde inte radera', msg);
    } finally {
      setDeletingFsId(null);
    }
  };

  const closePanel = () => {
    const isNew = !editingId;
    if (isNew && isFormDirtyModal()) {
      const message = 'Du har fyllt i uppgifter som inte är sparade. Vill du stänga utan att spara? Allt du fyllt i kommer att tas bort.';
      if (Platform.OS === 'web') {
        if (!window.confirm('Stäng ny fråga?\n\n' + message)) return;
      } else {
        Alert.alert('Stäng ny fråga?', message, [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Stäng', onPress: () => doClosePanel(true) },
        ]);
        return;
      }
    }
    doClosePanel(isNew);
  };

  const doClosePanel = (wasNewQuestion) => {
    setPanelVisible(false);
    setEditingId(null);
    setSelectedRowId(null);
    if (wasNewQuestion) resetFormNewQuestion();
  };

  // Uppdatera ref varje render så att ESC-lyssnaren alltid ser aktuellt tillstånd (inga stal closures)
  escStateRef.current = {
    responsiblePickerVisible,
    externalPersonModalVisible,
    datePickerVisible,
    externalGroupMenuVisible,
    disciplineMenuVisible,
    byggdelMenuVisible,
    panelVisible,
    closePanel,
  };

  // Rensa overlayOpenRef när en overlay stängs (t.ex. klick utanför), så nästa ESC stänger modalen
  useEffect(() => {
    if (!responsiblePickerVisible && overlayOpenRef.current === 'responsible') overlayOpenRef.current = null;
  }, [responsiblePickerVisible]);
  useEffect(() => {
    if (!externalPersonModalVisible && overlayOpenRef.current === 'externalPerson') overlayOpenRef.current = null;
  }, [externalPersonModalVisible]);
  useEffect(() => {
    if (!datePickerVisible && overlayOpenRef.current === 'datePicker') overlayOpenRef.current = null;
  }, [datePickerVisible]);
  useEffect(() => {
    if (!externalGroupMenuVisible && overlayOpenRef.current === 'externalGroup') overlayOpenRef.current = null;
  }, [externalGroupMenuVisible]);
  useEffect(() => {
    if (!disciplineMenuVisible && overlayOpenRef.current === 'discipline') overlayOpenRef.current = null;
  }, [disciplineMenuVisible]);
  useEffect(() => {
    if (!byggdelMenuVisible && overlayOpenRef.current === 'byggdel') overlayOpenRef.current = null;
  }, [byggdelMenuVisible]);
  useEffect(() => {
    if (!panelVisible) overlayOpenRef.current = null;
  }, [panelVisible]);

  // ESC: stäng bara picker/dropdown om någon är öppen; annars stäng Ny fråga. Fånga keyup i capture så Modal inte får eventet.
  const handleEscape = (e) => {
    if (e.key !== 'Escape') return;
    const s = escStateRef.current;
    if (!s.panelVisible) return; // Hantera bara när Ny fråga-modalen är öppen
    if (s.responsiblePickerVisible) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      setResponsiblePickerVisible(false);
      return;
    }
    if (s.externalPersonModalVisible) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      setExternalPersonModalVisible(false);
      return;
    }
    if (s.datePickerVisible) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      setDatePickerVisible(false);
      return;
    }
    if (s.externalGroupMenuVisible) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      setExternalGroupMenuVisible(false);
      return;
    }
    if (s.disciplineMenuVisible) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      setDisciplineMenuVisible(false);
      return;
    }
    if (s.byggdelMenuVisible) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      setByggdelMenuVisible(false);
      return;
    }
    if (s.panelVisible) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      s.closePanel();
    }
  };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKeyUp = (e) => handleEscape(e);
    document.addEventListener('keyup', onKeyUp, true);
    return () => document.removeEventListener('keyup', onKeyUp, true);
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKeyDown = (e) => handleEscape(e);
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const resolveFragaSvarRootPath = async () => {
    if (spFragaSvarRootPathRef.current) return spFragaSvarRootPathRef.current;
    let siteId;
    let rootFolderPath;
    try {
      siteId = await resolveProjectSiteId();
      rootFolderPath = await resolveProjectRootFolderPath();
    } catch (e) {
      reportSharePointFailure(
        'SharePoint-synk misslyckades. Projektets SharePoint-path saknas eller är felkonfigurerad',
        e,
      );
      throw e;
    }

    const rootPath = normalizeGraphPath(rootFolderPath);

    // FrågaSvar is a top-level phase folder (not nested under Översikt)
    const base = rootPath === '/'
      ? '/04 - FrågaSvar'
      : `${rootPath}/04 - FrågaSvar`;
    const normalized = normalizeGraphPath(base);
    const withoutLeadingSlash = normalized.replace(/^\/+/, '');

    // Ensure folder structure exists (safe even if already created)
    await ensureFolderPath(withoutLeadingSlash, safeText(companyId), siteId, { siteRole: 'projects', strict: true });

    spFragaSvarRootPathRef.current = withoutLeadingSlash;
    return withoutLeadingSlash;
  };

  // Excel FS-logg sync is performed asynchronously via a per-project queue (mutation-driven enqueue).
  // No UI-based Excel writing exists here.

  const ensureFsSubfolders = async (baseFolderPath) => {
    // Final specification: all files belong directly in the FS folder.
    // No Fråga/Svar/Bilagor subfolders are allowed.
    // Kept as a no-op for compatibility with older code paths.
    void baseFolderPath;
  };

  const ensureFolderPathForItem = async (it) => {
    const siteId = await resolveProjectSiteId();

    const existing = safeText(it?.sharePointFolderPath);
    if (existing) {
      await ensureFolderPath(existing, safeText(companyId), siteId, { siteRole: 'projects', strict: true });
      return existing;
    }

    const id = safeText(it?.id);
    const fsNumber = formatFsNumberFromItem(it);
    const title = safeText(it?.title) || deriveTitleFromText(it?.question);
    if (!fsNumber || !title) return null;
    const folderName = sanitizeSharePointFolderName(`${fsNumber} – ${title || 'Ärende'}`) || `${fsNumber}`;
    const rootFsPath = await resolveFragaSvarRootPath();
    const folderPath = `${rootFsPath}/${folderName}`;

    await ensureFolderPath(folderPath, safeText(companyId), siteId, { siteRole: 'projects', strict: true });
    return folderPath;
  };

  const uploadFilesToItem = async (it, files, ensuredFolderPath, attachedIn) => {
    const id = safeText(it?.id);
    const arr = Array.isArray(files) ? files : [];
    if (!id || arr.length === 0) return;

    const attachCtx = normalizeAttachedIn(attachedIn);

    setRowUploadErrorById((prev) => ({ ...(prev || {}), [id]: '' }));
    setRowUploadingById((prev) => ({ ...(prev || {}), [id]: true }));

    try {
      const siteId = await resolveProjectSiteId();

      const folderPath = safeText(ensuredFolderPath) || await ensureFolderPathForItem(it);
      if (!safeText(folderPath)) {
        throw new Error('Saknar underlag för att skapa FS-mapp (FS-nummer eller rubrik).');
      }
      // Final spec: all FS files live directly in the FS folder.

      const user = auth?.currentUser;
      const uploaded = [];

      for (const file of arr) {
        if (!file) continue;
        const originalName = safeText(file?.name) || `fil_${Date.now()}`;
        const safeName = originalName.replace(/[^a-zA-Z0-9._\-\s()ÅÄÖåäö]/g, '_');
        const stampedName = `${Date.now()}_${safeName}`;
        const path = `${folderPath}/${stampedName}`;

        const webUrl = await uploadFile({
          file,
          path,
          companyId: safeText(companyId),
          siteId,
          siteRole: 'projects',
          strictEnsure: true,
        });

        uploaded.push({
          name: originalName,
          webUrl,
          fileType: fileTypeFromName(originalName) || null,
          addedAt: new Date().toISOString(),
          addedByUid: user?.uid || null,
          addedByName: user?.displayName || user?.email || null,
          attachedIn: attachCtx,
        });
      }

      if (uploaded.length > 0) {
        const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === id);
        const prev = Array.isArray(current?.attachments) ? current.attachments : [];
        await updateFragaSvarItem(companyId, projectId, id, {
          attachments: uniqAttachments([...(Array.isArray(prev) ? prev : []), ...uploaded]),
          sharePointFolderPath: folderPath,
        });
      }

      await refreshFilesForItem({ ...it, sharePointFolderPath: safeText(it?.sharePointFolderPath) || folderPath });
    } catch (e) {
      reportSharePointFailure('Kunde inte ladda upp filer till SharePoint', e, { fsId: id });
      setRowUploadErrorById((prev) => ({ ...(prev || {}), [id]: String(e?.message || e || 'Kunde inte lägga till filer.') }));
    } finally {
      setRowUploadingById((prev) => ({ ...(prev || {}), [id]: false }));
    }
  };

  const refreshFilesForItem = async (it) => {
    const id = safeText(it?.id);
    if (!id) return;
    let siteId;
    try {
      siteId = await resolveProjectSiteId();
    } catch (e) {
      reportSharePointFailure('Kunde inte ansluta till SharePoint', e, { fsId: id });
      return;
    }
    let folderPath = safeText(it?.sharePointFolderPath);
    if (!folderPath) {
      try {
        const ensured = await ensureFolderPathForItem(it);
        folderPath = safeText(ensured);
      } catch (e) {
        reportSharePointFailure('Kunde inte säkerställa FS-mapp i SharePoint', e, { fsId: id });
        folderPath = '';
      }
      if (!folderPath) return;
    }

    setFsFolderFilesLoadingById((prev) => ({ ...(prev || {}), [id]: true }));
    try {
      // sharePointStructureService expects a path with a leading slash
      let merged = [];
      try {
        merged = await getSharePointFolderItems(siteId, `/${folderPath}`);
      } catch (e) {
        reportSharePointFailure('Kunde inte läsa filer från SharePoint', e, { fsId: id, folderPath });
        merged = [];
      }
      const files = (Array.isArray(merged) ? merged : []).filter((x) => x?.type === 'file');
      setFsFolderFilesById((prev) => ({ ...(prev || {}), [id]: files }));
    } catch (_e) {
      // keep UI stable, but never silent
      reportSharePointFailure('Kunde inte uppdatera fillista', _e, { fsId: id, folderPath });
    } finally {
      setFsFolderFilesLoadingById((prev) => ({ ...(prev || {}), [id]: false }));
    }
  };

  const ensureEditingFolderPath = async () => {
    const siteId = await resolveProjectSiteId();

    const existing = safeText(formSharePointFolderPath);
    if (existing) {
      const rootFsPath = await resolveFragaSvarRootPath();
      const existingLooksLikeFs = /04\s*[-–]\s*frågasvar/i.test(String(existing || ''));
      const shouldMigrate = safeText(rootFsPath) && !existingLooksLikeFs && !existing.startsWith(String(rootFsPath));

      if (!shouldMigrate) {
        await ensureFolderPath(existing, safeText(companyId), siteId, { siteRole: 'projects', strict: true });
        return existing;
      }

      const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(editingId));
      const fsNumber = formatFsNumberFromItem(current);
      const title = safeText(current?.title) || safeText(formTitle) || deriveTitleFromText(current?.question || formQuestion);
      if (!fsNumber || !title) return existing;
      const folderName = sanitizeSharePointFolderName(`${fsNumber} – ${title || 'Ärende'}`) || `${fsNumber}`;
      const folderPath = `${rootFsPath}/${folderName}`;

      await ensureFolderPath(folderPath, safeText(companyId), siteId, { siteRole: 'projects', strict: true });

      setFormSharePointFolderPath(folderPath);
      return folderPath;
    }

    const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(editingId));
    const fsNumber = formatFsNumberFromItem(current);
    const title = safeText(current?.title) || safeText(formTitle) || deriveTitleFromText(current?.question || formQuestion);
    if (!fsNumber || !title) throw new Error('Saknar underlag för att skapa mapp (FS-nummer eller rubrik).');
    const folderName = sanitizeSharePointFolderName(`${fsNumber} – ${title || 'Ärende'}`) || `${fsNumber}`;
    const rootFsPath = await resolveFragaSvarRootPath();
    const folderPath = `${rootFsPath}/${folderName}`;

    await ensureFolderPath(folderPath, safeText(companyId), siteId, { siteRole: 'projects', strict: true });

    setFormSharePointFolderPath(folderPath);
    return folderPath;
  };

  const addAttachmentRecord = (setAttachments, attachedIn) =>
    ({ name, webUrl }) => {
      const url = safeText(webUrl);
      if (!url) return;
      const displayName = safeText(name) || url;
      const user = auth?.currentUser;
      const ext = fileTypeFromName(displayName);
      const attachCtx = normalizeAttachedIn(attachedIn);
      setAttachments((prev) =>
        uniqAttachments([
          ...(Array.isArray(prev) ? prev : []),
          {
            name: displayName,
            webUrl: url,
            fileType: ext || null,
            addedAt: new Date().toISOString(),
            addedByUid: user?.uid || null,
            addedByName: user?.displayName || user?.email || null,
            attachedIn: attachCtx,
          },
        ])
      );
    };

  const uploadAndAttachFiles = async ({
    files,
    targetFolderPath,
    setAttachments,
    setIsUploading,
    setErr,
    setDrag,
    inputRef,
    attachedIn,
  }) => {
    const arr = Array.isArray(files) ? files : [];
    if (arr.length === 0) return;
    setErr('');
    setIsUploading(true);

    try {
      const siteId = await resolveProjectSiteId();
      const basePath = safeText(targetFolderPath) || await resolveFragaSvarRootPath();

      const attach = addAttachmentRecord(setAttachments, attachedIn);

      for (const file of arr) {
        if (!file) continue;
        const originalName = safeText(file?.name) || `fil_${Date.now()}`;
        const safeName = originalName.replace(/[^a-zA-Z0-9._\-\s()ÅÄÖåäö]/g, '_');
        const stampedName = `${Date.now()}_${safeName}`;
        const path = `${basePath}/${stampedName}`;

        const webUrl = await uploadFile({
          file,
          path,
          companyId: safeText(companyId),
          siteId,
          siteRole: 'projects',
          strictEnsure: true,
        });
        attach({ name: originalName, webUrl });
      }
    } catch (e) {
      reportSharePointFailure('Kunde inte bifoga fil i SharePoint', e);
      setErr(String(e?.message || e || 'Kunde inte bifoga fil.'));
    } finally {
      setIsUploading(false);
      setDrag(false);
      try {
        if (inputRef?.current) inputRef.current.value = '';
      } catch (_e) {}
    }
  };

  const removeAttachment = (webUrl) => {
    const target = safeText(webUrl);
    setFormAttachments((prev) => (Array.isArray(prev) ? prev.filter((a) => safeText(a?.webUrl) !== target) : prev));
  };

  const listData = useMemo(() => {
    const out = [{ type: 'top', key: 'top' }];
    if (loading) {
      out.push({ type: 'loading', key: 'loading' });
      return out;
    }
    if (filteredAndSorted.length === 0) {
      out.push({ type: 'empty', key: 'empty' });
      return out;
    }
    out.push({ type: 'tableContainer', key: 'tableContainer' });
    return out;
  }, [filteredAndSorted, loading]);

  const FS_DEFAULT_COLUMN_WIDTHS = {
    byggdel: 90, rubrik: 260, discipline: 100, skapadDatum: 100, skapadAv: 120, tilldelade: 140, svarSenast: 100, svarAv: 120, besvaradDatum: 100, status: 140,
  };
  const FS_MIN_COL_WIDTH = 60;
  const FS_RESIZE_HANDLE_W = 6;

  const [columnWidths, setColumnWidths] = useState(FS_DEFAULT_COLUMN_WIDTHS);
  const resizeRef = useRef({ column: null, startX: 0, startWidth: 0 });
  const [rowCtxMenu, setRowCtxMenu] = useState(null);

  const col = (key) => ({ width: columnWidths[key], minWidth: columnWidths[key], maxWidth: columnWidths[key], flexGrow: 0, flexShrink: 0 });

  const FS_COLUMN_KEYS = ['byggdel', 'rubrik', 'discipline', 'skapadDatum', 'skapadAv', 'tilldelade', 'svarSenast', 'svarAv', 'besvaradDatum', 'status'];
  const totalTableWidth = useMemo(() => {
    const sum = FS_COLUMN_KEYS.reduce((acc, k) => acc + (columnWidths[k] || 0), 0);
    return sum + FS_COLUMN_KEYS.length * FS_RESIZE_HANDLE_W;
  }, [columnWidths]);

  const FS_CHARS_TO_WIDTH = 8;
  const FS_CELL_PADDING = COLUMN_PADDING_LEFT + COLUMN_PADDING_RIGHT + 12;
  const FS_MAX_AUTO_WIDTH = 500;

  const FS_HEADER_LABELS = {
    byggdel: 'Byggdel', rubrik: 'Rubrik', discipline: 'Disciplin', skapadDatum: 'Skapad', skapadAv: 'Skapad av', tilldelade: 'Tilldelade', svarSenast: 'Svar senast', svarAv: 'Svar av', besvaradDatum: 'Besvarad', status: 'Status',
  };

  const getCellText = useCallback((row, columnKey) => {
    if (!row) return '';
    switch (columnKey) {
      case 'byggdel': return normalizeBd(row.bd) || '';
      case 'rubrik': {
        const fs = formatFsNumberFromItem(row) || '';
        const t = safeText(row.title) || deriveTitleFromText(row.question);
        return fs ? `${fs} – ${t}` : t;
      }
      case 'discipline': return displayDiscipline(row) || '';
      case 'skapadDatum': return formatDateTime(row.createdAt) || '';
      case 'skapadAv': return safeText(row.createdByName) || '';
      case 'tilldelade': return formatResponsiblesSummary(row) || '';
      case 'svarSenast': return normalizeDateYmd(row.needsAnswerBy) || '';
      case 'svarAv': return safeText(row.answeredByName) || '';
      case 'besvaradDatum': return formatDateTime(row.answeredAt) || '';
      case 'status': return displayStatusLabel(normalizeStatusValue(safeText(row.status) || 'Obesvarad'));
      default: return '';
    }
  }, []);

  const contentWidthForColumn = useCallback((headerLabel, cellTexts) => {
    const maxLen = Math.max(
      String(headerLabel || '').length,
      ...cellTexts.map((t) => String(t || '').length),
    );
    return Math.min(Math.max(maxLen * FS_CHARS_TO_WIDTH + FS_CELL_PADDING, FS_MIN_COL_WIDTH), FS_MAX_AUTO_WIDTH);
  }, []);

  const widenColumn = useCallback((columnKey) => {
    const headerLabel = FS_HEADER_LABELS[columnKey] || '';
    const cellTexts = (Array.isArray(filteredAndSorted) ? filteredAndSorted : []).map((row) => getCellText(row, columnKey));
    const optimal = contentWidthForColumn(headerLabel, cellTexts);
    setColumnWidths((prev) => ({ ...prev, [columnKey]: optimal }));
  }, [filteredAndSorted, getCellText, contentWidthForColumn]);

  const lastClickRef = useRef({ column: null, time: 0 });

  const startResize = useCallback((column, e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    const last = lastClickRef.current;
    if (last.column === column && now - last.time < 400) {
      lastClickRef.current = { column: null, time: 0 };
      widenColumn(column);
      return;
    }
    lastClickRef.current = { column, time: now };

    const clientX = e.clientX ?? e.nativeEvent?.pageX ?? 0;
    resizeRef.current = { column, startX: clientX, startWidth: columnWidths[column] };
  }, [columnWidths, widenColumn]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMove = (e) => {
      const { column, startX, startWidth } = resizeRef.current;
      if (column == null) return;
      const delta = (e.clientX ?? 0) - startX;
      const newWidth = Math.max(FS_MIN_COL_WIDTH, startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [column]: newWidth }));
      resizeRef.current = { ...resizeRef.current, startX: e.clientX, startWidth: newWidth };
    };
    const onUp = () => { resizeRef.current = { column: null, startX: 0, startWidth: 0 }; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const handleRowContextMenu = useCallback((e, it) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    setRowCtxMenu({ x: e.clientX ?? e.nativeEvent?.pageX ?? 0, y: e.clientY ?? e.nativeEvent?.pageY ?? 0, item: it });
  }, []);

  const toneForRow = (status, overdue) => {
    const s = normalizeStatusValue(status);
    if (s === 'Klar' || s === 'Ej aktuell') return {
      bg: '#ECFDF5',
      statusBg: '#DCFCE7',
      statusBorder: '#86EFAC',
      statusFg: '#166534',
    };
    if (s === 'Pågår') return {
      bg: overdue ? '#FEF3C7' : '#FFFBEB',
      statusBg: overdue ? '#FCD34D' : '#FEF3C7',
      statusBorder: overdue ? '#F59E0B' : '#FCD34D',
      statusFg: '#92400E',
    };
    return {
      bg: '#FFF1F2',
      statusBg: '#FFE4E6',
      statusBorder: '#FDA4AF',
      statusFg: '#9F1239',
    };
  };

  const renderOneTableRow = (it) => {
    const id = safeText(it?.id);
    if (!id) return null;
    const status = safeText(it?.status) || 'Obesvarad';
    const normalizedStatus = STATUSES.includes(normalizeStatusValue(status)) ? normalizeStatusValue(status) : 'Obesvarad';
    const overdue = normalizedStatus === 'Pågår' && isOverdueNeedsAnswerBy(it?.needsAnswerBy);
    const tone = toneForRow(normalizedStatus, overdue);
    const bd = normalizeBd(it?.bd) || '—';
    const discipline = displayDiscipline(it) || '—';
    const ansvarigSummary = formatResponsiblesSummary(it);
    const responsibles = normalizeResponsiblesFromItem(it);
    const responsiblesTooltip = responsibles.map((r) => { const name = safeText(r?.name); const role = safeText(r?.role); return name ? `${name}${role ? ` (${role})` : ''}` : ''; }).filter(Boolean).join(', ');
    const needsBy = normalizeDateYmd(it?.needsAnswerBy) || '—';
    const fsNumber = formatFsNumberFromItem(it) || '';
    const title = safeText(it?.title) || deriveTitleFromText(safeText(it?.question));
    const isDeleting = deletingFsId === id;
    const rowIdx = Array.isArray(filteredAndSorted) ? filteredAndSorted.indexOf(it) : -1;
    const rowBg = rowIdx % 2 === 1 ? COLORS.tableRowAltBg : COLORS.tableRowBg;
    return (
      <View style={{ borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.tableRowBorder, overflow: 'hidden' }}>
        <Pressable
          onPress={isDeleting ? undefined : () => openEdit(it)}
          onLongPress={isDeleting ? undefined : (e) => handleRowContextMenu(e, it)}
          disabled={isDeleting}
          style={({ hovered, pressed }) => ({
            flexDirection: 'row',
            alignItems: 'stretch',
            minHeight: MODAL_DESIGN_2026.tableRowHeight,
            backgroundColor: isDeleting ? COLORS.bgMuted : (pressed ? 'rgba(25,118,210,0.04)' : (hovered ? COLORS.tableRowHoverBg : rowBg)),
            opacity: isDeleting ? 0.85 : 1,
            ...(Platform.OS === 'web' ? { cursor: isDeleting ? 'default' : 'pointer' } : {}),
          })}
          {...(Platform.OS === 'web' ? { onContextMenu: (e) => handleRowContextMenu(e, it) } : {})}
        >
          <View style={{ ...col('byggdel'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
            <Text style={{ color: COLORS.text, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{bd}</Text>
          </View>
          <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />
          <View style={{ ...col('rubrik'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
            <Text style={{ color: COLORS.text, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{fsNumber ? `${fsNumber} – ` : ''}{title || '—'}</Text>
          </View>
          <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />
          <View style={{ ...col('discipline'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1} title={Platform.OS === 'web' ? discipline : undefined}>{discipline}</Text>
          </View>
          <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />
          <View style={{ ...col('skapadDatum'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{formatDateTime(it?.createdAt) || '—'}</Text>
          </View>
          <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />
          <View style={{ ...col('skapadAv'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{safeText(it?.createdByName) || '—'}</Text>
          </View>
          <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />
          <View style={{ ...col('tilldelade'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={2} title={Platform.OS === 'web' ? (responsiblesTooltip || ansvarigSummary) : undefined}>{ansvarigSummary}</Text>
          </View>
          <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />
          <View style={{ ...col('svarSenast'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{needsBy}</Text>
          </View>
          <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />
          <View style={{ ...col('svarAv'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{safeText(it?.answeredByName) || '—'}</Text>
          </View>
          <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />
          <View style={{ ...col('besvaradDatum'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{formatDateTime(it?.answeredAt) || '—'}</Text>
          </View>
          <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />
          <Pressable
            onPress={isDeleting ? undefined : (e) => { e.stopPropagation(); openRowStatusMenu(e, it); }}
            disabled={isDeleting}
            style={({ hovered, pressed }) => ({ ...col('status'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6, ...(Platform.OS === 'web' ? { cursor: isDeleting ? 'default' : 'pointer' } : {}) })}
          >
            <View style={{ width: 92, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 999, borderWidth: 1, borderColor: tone.statusBorder, backgroundColor: tone.statusBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {overdue ? <Ionicons name="alert-circle" size={12} color={tone.statusFg} /> : null}
              <Text style={{ fontSize: 11, fontWeight: FW_MED, color: tone.statusFg }} numberOfLines={1}>{displayStatusLabel(normalizedStatus)}</Text>
              <Ionicons name="chevron-down" size={12} color={tone.statusFg} />
            </View>
          </Pressable>
        </Pressable>
      </View>
    );
  };

  const renderListItem = ({ item }) => {
    if (item?.type === 'top') {
      return (
        <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 }}>
          {!hidePageHeader ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Ionicons name="help-circle-outline" size={22} color="#1976D2" style={{ marginRight: 10 }} />
              <Text style={[PROJECT_TYPOGRAPHY.viewTitle, { color: COLORS.text, fontWeight: FW_MED }]}>Fråga/Svar</Text>
            </View>
          ) : null}

          <Text style={[PROJECT_TYPOGRAPHY.introText, { marginBottom: 14, color: COLORS.textMuted }]}>
            Överblick först, detaljer vid behov. Klicka en rad för att öppna ärendet.
          </Text>

          {!hasContext ? (
            <View style={{ padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.bgMuted }}>
              <Text style={{ color: COLORS.textMuted }}>Saknar projektkontext (companyId/projectId).</Text>
            </View>
          ) : null}

          {error ? (
            <View style={{ padding: 12, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 10, marginBottom: 12 }}>
              <Text style={{ color: '#991B1B', fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          {sharePointError ? (
            <View style={{ padding: 12, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Ionicons name="warning-outline" size={18} color="#991B1B" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#991B1B', fontSize: 13, fontWeight: FW_MED, marginBottom: 2 }}>SharePoint-synk misslyckades</Text>
                <Text style={{ color: '#991B1B', fontSize: 13 }}>{sharePointError}</Text>
              </View>
              <Pressable
                onPress={() => setSharePointError('')}
                style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.8 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) })}
              >
                <Ionicons name="close" size={18} color="#991B1B" />
              </Pressable>
            </View>
          ) : null}

          {excelSyncInfo ? (
            <View style={{ padding: 12, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', borderRadius: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Ionicons name="information-circle-outline" size={18} color="#1D4ED8" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#1D4ED8', fontSize: 13, fontWeight: FW_MED, marginBottom: 2 }}>Excel</Text>
                <Text style={{ color: '#1E40AF', fontSize: 13 }}>{excelSyncInfo}</Text>
              </View>
            </View>
          ) : null}

          {/* Toolbar */}
          <View style={{
            flexDirection: Platform.OS === 'web' ? 'row' : 'column',
            alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
            gap: 10,
            marginBottom: 12,
          }}>
            <View style={{ flex: 1, minWidth: 220, maxWidth: Platform.OS === 'web' ? 520 : undefined }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: COLORS.inputBorder,
                borderRadius: 10,
                paddingHorizontal: 10,
                backgroundColor: '#fff',
              }}>
                <Ionicons name="search" size={16} color={COLORS.textSubtle} style={{ marginRight: 8 }} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Sök (byggdel, rubrik, status, svar…)"
                  placeholderTextColor={COLORS.textSubtle}
                  style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: COLORS.text }}
                />
                {search ? (
                  <Pressable onPress={() => setSearch('')} style={{ padding: 6 }}>
                    <Ionicons name="close" size={16} color={COLORS.textSubtle} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              ...(Platform.OS === 'web' ? { flexShrink: 0 } : {}),
            }}>
              {Platform.OS === 'web' ? (
                <Pressable
                  onPress={backfillSharePointFolders}
                  disabled={!hasContext || backfillRunning}
                  style={({ hovered, pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: COLORS.inputBorder,
                    backgroundColor: '#fff',
                    opacity: (!hasContext || backfillRunning) ? 0.6 : 1,
                    ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                    ...(pressed ? { opacity: 0.9 } : {}),
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  })}
                >
                  <Ionicons name="folder-open-outline" size={16} color={COLORS.textSubtle} />
                  <Text style={{ fontSize: 13, fontWeight: FW_MED, color: COLORS.textMuted }} numberOfLines={1}>
                    {backfillRunning ? 'Backfill…' : 'Backfill mappar'}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={openStatusMenu}
                style={({ hovered, pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 9,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.inputBorder,
                  backgroundColor: '#fff',
                  ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                  ...(pressed ? { opacity: 0.9 } : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Ionicons name="funnel-outline" size={16} color={COLORS.textSubtle} />
                <Text style={{ fontSize: 13, fontWeight: FW_MED, color: COLORS.textMuted }} numberOfLines={1}>
                  Status: {filterStatus === 'Alla' ? 'Alla' : displayStatusLabel(filterStatus)}
                </Text>
                <Ionicons name="chevron-down" size={14} color={COLORS.textSubtle} />
              </Pressable>

              <Pressable
                onPress={() => setShowDeleted((v) => !v)}
                style={({ hovered, pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 9,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.inputBorder,
                  backgroundColor: showDeleted ? 'rgba(25,118,210,0.06)' : '#fff',
                  ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                  ...(pressed ? { opacity: 0.9 } : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Ionicons name={showDeleted ? 'trash' : 'trash-outline'} size={16} color={COLORS.textSubtle} />
                <Text style={{ fontSize: 13, fontWeight: FW_MED, color: COLORS.textMuted }} numberOfLines={1}>
                  Visa raderade
                </Text>
              </Pressable>

              {filterStatus !== 'Alla' ? (
                <Pressable
                  onPress={() => { setFilterStatus('Alla'); }}
                  style={({ hovered, pressed }) => ({
                    paddingVertical: 9,
                    paddingHorizontal: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: COLORS.inputBorder,
                    backgroundColor: '#fff',
                    ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                    ...(pressed ? { opacity: 0.9 } : {}),
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  })}
                >
                  <Ionicons name="close" size={16} color={COLORS.textSubtle} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {backfillRunning && backfillInfo ? (
            <View style={{ padding: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.bgMuted, marginBottom: 12 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{backfillInfo}</Text>
            </View>
          ) : null}

          {/* Ny fråga – öppnar samma modal som vid redigera */}
          <View style={{
            paddingTop: 4,
            paddingBottom: 12,
            marginBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.tableBorder,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={openNewQuestion}
                style={({ hovered, pressed }) => ({
                  ...PRIMARY_ACTION_BUTTON_BASE,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  ...(Platform.OS === 'web' && hovered ? { backgroundColor: COLORS.blueHover } : {}),
                  ...(pressed ? { opacity: 0.9 } : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: FW_MED }}>
                  Ny fråga
                </Text>
              </Pressable>
            </View>
          </View>

        </View>
      );
    }

    if (item?.type === 'tableHeader') {
      const sortIcon = (col) => {
        if (sortColumn !== col) return 'swap-vertical-outline';
        return sortDirection === 'asc' ? 'chevron-up' : 'chevron-down';
      };

      const HeaderCell = ({ col, label, style }) => (
        <Pressable
          onPress={() => toggleSort(col)}
          style={({ hovered, pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
            paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
            paddingLeft: COLUMN_PADDING_LEFT,
            paddingRight: COLUMN_PADDING_RIGHT,
            backgroundColor: pressed ? 'rgba(15,23,42,0.04)' : (hovered ? 'rgba(15,23,42,0.02)' : 'transparent'),
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            ...style,
          })}
        >
          <Text style={{ color: COLORS.tableHeaderText, fontSize: MODAL_DESIGN_2026.tableHeaderFontSize, fontWeight: MODAL_DESIGN_2026.tableHeaderFontWeight }} numberOfLines={1}>{label}</Text>
          <Ionicons name={sortIcon(col)} size={14} color={COLORS.textSubtle} />
        </Pressable>
      );

      const ResizeHandle = ({ colKey }) => (
        Platform.OS === 'web' ? (
          <View
            onMouseDown={(e) => startResize(colKey, e)}
            style={{ width: FS_RESIZE_HANDLE_W, alignSelf: 'stretch', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', cursor: 'col-resize' }}
          >
            <View style={{ position: 'absolute', left: Math.floor(FS_RESIZE_HANDLE_W / 2) - 1, top: 4, bottom: 4, width: 2, backgroundColor: '#cbd5e1', borderRadius: 1 }} />
          </View>
        ) : null
      );

      return (
        <View style={{ backgroundColor: '#fff' }}>
          <View style={{ paddingHorizontal: 18 }}>
            <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: COLORS.tableBorder, backgroundColor: COLORS.tableHeaderBg, overflow: 'hidden', borderRadius: MODAL_DESIGN_2026.tableRadius }}>
              <HeaderCell col="bd" label="Byggdel" style={col('byggdel')} />
              <ResizeHandle colKey="byggdel" />
              <HeaderCell col="title" label="Rubrik" style={col('rubrik')} />
              <ResizeHandle colKey="rubrik" />
              <HeaderCell col="discipline" label="Disciplin" style={col('discipline')} />
              <ResizeHandle colKey="discipline" />
              <HeaderCell col="createdAt" label="Skapad" style={col('skapadDatum')} />
              <ResizeHandle colKey="skapadDatum" />
              <HeaderCell col="createdByName" label="Skapad av" style={col('skapadAv')} />
              <ResizeHandle colKey="skapadAv" />
              <HeaderCell col="responsibles" label="Tilldelade" style={col('tilldelade')} />
              <ResizeHandle colKey="tilldelade" />
              <HeaderCell col="needsAnswerBy" label="Svar senast" style={col('svarSenast')} />
              <ResizeHandle colKey="svarSenast" />
              <HeaderCell col="answeredByName" label="Svar av" style={col('svarAv')} />
              <ResizeHandle colKey="svarAv" />
              <HeaderCell col="answeredAt" label="Besvarad" style={col('besvaradDatum')} />
              <ResizeHandle colKey="besvaradDatum" />
              <HeaderCell col="status" label="Status" style={col('status')} />
            </View>
          </View>
        </View>
      );
    }

    if (item?.type === 'tableContainer') {
      const sortIcon = (colKey) => (sortColumn !== colKey ? 'swap-vertical-outline' : (sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'));
      const HeaderCell = ({ col: colKey, label, style }) => (
        <Pressable
          onPress={() => toggleSort(colKey)}
          style={({ hovered, pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
            paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
            paddingLeft: COLUMN_PADDING_LEFT,
            paddingRight: COLUMN_PADDING_RIGHT,
            backgroundColor: pressed ? 'rgba(15,23,42,0.04)' : (hovered ? 'rgba(15,23,42,0.02)' : 'transparent'),
            ...style,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          })}
        >
          <Text style={{ color: COLORS.tableHeaderText, fontSize: MODAL_DESIGN_2026.tableHeaderFontSize, fontWeight: MODAL_DESIGN_2026.tableHeaderFontWeight }} numberOfLines={1}>{label}</Text>
          <Ionicons name={sortIcon(colKey)} size={14} color={COLORS.textSubtle} />
        </Pressable>
      );
      const ResizeHandle = ({ colKey: colKeyR }) => (Platform.OS === 'web' ? (
        <View onMouseDown={(e) => startResize(colKeyR, e)} style={{ width: FS_RESIZE_HANDLE_W, alignSelf: 'stretch', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', cursor: 'col-resize' }}>
          <View style={{ position: 'absolute', left: Math.floor(FS_RESIZE_HANDLE_W / 2) - 1, top: 4, bottom: 4, width: 2, backgroundColor: '#cbd5e1', borderRadius: 1 }} />
        </View>
      ) : null);
      return (
        <View style={{ paddingHorizontal: 18, paddingBottom: 28 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={{ paddingRight: 18 }}
          >
            <View style={{ width: totalTableWidth }}>
              <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: COLORS.tableBorder, backgroundColor: COLORS.tableHeaderBg, overflow: 'hidden', borderRadius: MODAL_DESIGN_2026.tableRadius }}>
                <HeaderCell col="bd" label="Byggdel" style={col('byggdel')} />
                <ResizeHandle colKey="byggdel" />
                <HeaderCell col="title" label="Rubrik" style={col('rubrik')} />
                <ResizeHandle colKey="rubrik" />
                <HeaderCell col="discipline" label="Disciplin" style={col('discipline')} />
                <ResizeHandle colKey="discipline" />
                <HeaderCell col="createdAt" label="Skapad" style={col('skapadDatum')} />
                <ResizeHandle colKey="skapadDatum" />
                <HeaderCell col="createdByName" label="Skapad av" style={col('skapadAv')} />
                <ResizeHandle colKey="skapadAv" />
                <HeaderCell col="responsibles" label="Tilldelade" style={col('tilldelade')} />
                <ResizeHandle colKey="tilldelade" />
                <HeaderCell col="needsAnswerBy" label="Svar senast" style={col('svarSenast')} />
                <ResizeHandle colKey="svarSenast" />
                <HeaderCell col="answeredByName" label="Svar av" style={col('svarAv')} />
                <ResizeHandle colKey="svarAv" />
                <HeaderCell col="answeredAt" label="Besvarad" style={col('besvaradDatum')} />
                <ResizeHandle colKey="besvaradDatum" />
                <HeaderCell col="status" label="Status" style={col('status')} />
              </View>
              {(filteredAndSorted || []).map((rowIt) => (
                <View key={safeText(rowIt?.id)}>{renderOneTableRow(rowIt)}</View>
              ))}
            </View>
          </ScrollView>
        </View>
      );
    }

    if (item?.type === 'loading') {
      return (
        <View style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
          <Text style={{ color: COLORS.textMuted }}>Laddar…</Text>
        </View>
      );
    }

    if (item?.type === 'empty') {
      return (
        <View style={{ paddingHorizontal: 18, paddingVertical: 22, alignItems: 'center' }}>
          <Ionicons name="help-circle-outline" size={36} color="#CBD5E1" style={{ marginBottom: 10 }} />
          <Text style={{ color: COLORS.textMuted, fontWeight: FW_MED, marginBottom: 4 }}>Inga frågor ännu</Text>
          <Text style={{ color: COLORS.textSubtle, fontSize: 13, textAlign: 'center' }}>
            Skapa en ny fråga i formuläret ovan.
          </Text>
        </View>
      );
    }

    if (item?.type === 'row') {
      const it = item?.it;
      const id = safeText(it?.id);
      if (!id) return null;

      const lastVisibleId = safeText((Array.isArray(filteredAndSorted) && filteredAndSorted.length > 0)
        ? filteredAndSorted[filteredAndSorted.length - 1]?.id
        : null);
      const isLastVisibleRow = safeText(id) && safeText(id) === lastVisibleId;

      const status = safeText(it?.status) || 'Obesvarad';
      const normalizedStatus = STATUSES.includes(normalizeStatusValue(status)) ? normalizeStatusValue(status) : 'Obesvarad';
      const overdue = normalizedStatus === 'Pågår' && isOverdueNeedsAnswerBy(it?.needsAnswerBy);
      const tone = toneForRow(normalizedStatus, overdue);

      const bd = normalizeBd(it?.bd) || '—';
      const discipline = displayDiscipline(it) || '—';
      const responsibles = normalizeResponsiblesFromItem(it);
      const ansvarigSummary = formatResponsiblesSummary(it);
      const responsiblesTooltip = responsibles
        .map((r) => {
          const name = safeText(r?.name);
          const role = safeText(r?.role);
          return name ? `${name}${role ? ` (${role})` : ''}` : '';
        })
        .filter(Boolean)
        .join(', ');
      const needsBy = normalizeDateYmd(it?.needsAnswerBy) || '—';

      const questionText = safeText(it?.question);
      const fsNumber = formatFsNumberFromItem(it) || '';
      const title = safeText(it?.title) || deriveTitleFromText(questionText);

      const isDeleting = deletingFsId === id;

      const rowIdx = Array.isArray(filteredAndSorted) ? filteredAndSorted.indexOf(it) : -1;
      const rowBg = rowIdx % 2 === 1 ? COLORS.tableRowAltBg : COLORS.tableRowBg;

      return (
        <View style={{ paddingHorizontal: 18 }}>
          <View style={{ borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.tableRowBorder, overflow: 'hidden' }}>
            <Pressable
              onPress={isDeleting ? undefined : () => openEdit(it)}
              onLongPress={isDeleting ? undefined : (e) => handleRowContextMenu(e, it)}
              disabled={isDeleting}
              style={({ hovered, pressed }) => ({
                flexDirection: 'row',
                alignItems: 'stretch',
                minHeight: MODAL_DESIGN_2026.tableRowHeight,
                backgroundColor: isDeleting ? COLORS.bgMuted : (pressed ? 'rgba(25,118,210,0.04)' : (hovered ? COLORS.tableRowHoverBg : rowBg)),
                opacity: isDeleting ? 0.85 : 1,
                ...(Platform.OS === 'web' ? { cursor: isDeleting ? 'default' : 'pointer' } : {}),
              })}
              {...(Platform.OS === 'web' ? { onContextMenu: (e) => handleRowContextMenu(e, it) } : {})}
            >
              <View style={{ ...col('byggdel'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
                <Text style={{ color: COLORS.text, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{bd}</Text>
              </View>
              <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />

              <View style={{ ...col('rubrik'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
                <Text style={{ color: COLORS.text, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>
                  {fsNumber ? `${fsNumber} – ` : ''}{title || '—'}
                </Text>
              </View>
              <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />

              <View style={{ ...col('discipline'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
                <Text
                  style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }}
                  numberOfLines={1}
                  title={Platform.OS === 'web' ? discipline : undefined}
                >
                  {discipline}
                </Text>
              </View>
              <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />

              <View style={{ ...col('skapadDatum'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
                <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{formatDateTime(it?.createdAt) || '—'}</Text>
              </View>
              <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />

              <View style={{ ...col('skapadAv'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
                <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{safeText(it?.createdByName) || '—'}</Text>
              </View>
              <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />

              <View style={{ ...col('tilldelade'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
                <Text
                  style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }}
                  numberOfLines={2}
                  title={Platform.OS === 'web' ? (responsiblesTooltip || ansvarigSummary) : undefined}
                >
                  {ansvarigSummary}
                </Text>
              </View>
              <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />

              <View style={{ ...col('svarSenast'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
                <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{needsBy}</Text>
              </View>
              <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />

              <View style={{ ...col('svarAv'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
                <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{safeText(it?.answeredByName) || '—'}</Text>
              </View>
              <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />

              <View style={{ ...col('besvaradDatum'), paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal, justifyContent: 'center' }}>
                <Text style={{ color: COLORS.textMuted, fontSize: MODAL_DESIGN_2026.tableCellFontSize }} numberOfLines={1}>{formatDateTime(it?.answeredAt) || '—'}</Text>
              </View>
              <View style={{ width: FS_RESIZE_HANDLE_W, flexShrink: 0 }} />

              <Pressable
                onPress={isDeleting ? undefined : (e) => { e.stopPropagation(); openRowStatusMenu(e, it); }}
                disabled={isDeleting}
                style={({ hovered, pressed }) => ({
                  ...col('status'),
                  paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
                  paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: 6,
                  ...(Platform.OS === 'web' ? { cursor: isDeleting ? 'default' : 'pointer' } : {}),
                })}
              >
                <View style={{ width: 92, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 999, borderWidth: 1, borderColor: tone.statusBorder, backgroundColor: tone.statusBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {overdue ? <Ionicons name="alert-circle" size={12} color={tone.statusFg} /> : null}
                  <Text style={{ fontSize: 11, fontWeight: FW_MED, color: tone.statusFg }} numberOfLines={1}>
                    {displayStatusLabel(normalizedStatus)}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color={tone.statusFg} />
                </View>
              </Pressable>
            </Pressable>
          </View>
        </View>
      );
    }

    return null;
  };

  return (
    <ErrorBoundary>
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {/* File preview */}
      <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={closePreview}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.50)', padding: 18, justifyContent: 'center' }}>
          <Pressable onPress={closePreview} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View
            style={{
              width: '100%',
              maxWidth: 1100,
              alignSelf: 'center',
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              overflow: 'hidden',
              ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.22)', maxHeight: '85vh' } : {}),
            }}
          >
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: FW_MED, color: COLORS.text }} numberOfLines={1}>{previewName || 'Fil'}</Text>
              <Pressable
                onPress={async () => {
                  const url = safeText(previewUrl);
                  if (!url) return;
                  const can = await Linking.canOpenURL(url).catch(() => false);
                  if (can) await Linking.openURL(url);
                }}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.inputBorder,
                  backgroundColor: '#fff',
                  ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                  ...(pressed ? { opacity: 0.9 } : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Text style={{ color: COLORS.blue, fontWeight: FW_MED }}>Öppna länk</Text>
              </Pressable>
              <Pressable onPress={closePreview} style={{ padding: 8 }}>
                <Ionicons name="close" size={20} color={COLORS.textSubtle} />
              </Pressable>
            </View>

            <View style={{ padding: 12 }}>
              {Platform.OS !== 'web' ? (
                <View style={{ height: 520, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, overflow: 'hidden' }}>
                  <WebView
                    source={{ uri: previewUrl }}
                    originWhitelist={['*']}
                    startInLoadingState
                  />
                </View>
              ) : null}

              {Platform.OS === 'web' && previewKind === 'pdf' ? (
                <iframe title={previewName || 'PDF'} src={previewUrl} style={{ width: '100%', height: '70vh', border: '0' }} />
              ) : null}

              {Platform.OS === 'web' && previewKind === 'image' ? (
                <img alt={previewName || 'Bild'} src={previewUrl} style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
              ) : null}

              {Platform.OS === 'web' && previewKind === 'file' ? (
                <View style={{ padding: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, backgroundColor: COLORS.bgMuted }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
                    Förhandsvisning stöds just nu för PDF och bilder. Använd “Öppna länk” för att granska filen.
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* Row context menu (right-click) */}
      <ContextMenu
        visible={!!rowCtxMenu}
        x={rowCtxMenu?.x ?? 0}
        y={rowCtxMenu?.y ?? 0}
        items={[
          { label: 'Svara', value: 'answer', icon: 'chatbubble-outline' },
          ...(canDeleteFs ? [{ label: 'Ta bort', value: 'delete', icon: 'trash-outline', destructive: true }] : []),
        ]}
        onClose={() => setRowCtxMenu(null)}
        onSelect={(menuItem) => {
          const ctxIt = rowCtxMenu?.item;
          setRowCtxMenu(null);
          if (!ctxIt) return;
          if (menuItem?.value === 'answer') openAnswer(ctxIt);
          if (menuItem?.value === 'delete') handleDelete(ctxIt);
        }}
      />

      {/* Status dropdown menu (web) */}
      <ContextMenu
        visible={statusMenuVisible}
        x={statusMenuPos.x}
        y={statusMenuPos.y}
        items={statusMenuItems}
        onClose={() => setStatusMenuVisible(false)}
        onSelect={(item) => {
          const value = String(item?.value || '').trim();
          if (value === 'Alla' || STATUSES.includes(value)) setFilterStatus(value);
          setStatusMenuVisible(false);
        }}
      />

      {/* Row status dropdown menu (web) */}
      <ContextMenu
        visible={rowStatusMenuVisible}
        x={rowStatusMenuPos.x}
        y={rowStatusMenuPos.y}
        items={rowStatusMenuItems}
        onClose={() => {
          setRowStatusMenuVisible(false);
          setRowStatusTarget(null);
        }}
        onSelect={(item) => {
          const value = String(item?.value || '').trim();
          if (STATUSES.includes(value) && rowStatusTarget) {
            setItemStatus(rowStatusTarget, value);
          }
          setRowStatusMenuVisible(false);
          setRowStatusTarget(null);
        }}
      />

      {/* Disciplin dropdown menu (web) */}
      <ContextMenu
        visible={disciplineMenuVisible}
        x={disciplineMenuPos.x}
        y={disciplineMenuPos.y}
        items={disciplineMenuItems}
        onClose={() => setDisciplineMenuVisible(false)}
        onSelect={(item) => {
          const value = String(item?.value || '').trim();
          if (DISCIPLINE_CHOICES.includes(value)) {
            if (disciplineMenuFor === 'form') setFormDiscipline(value);
            else setQuickDiscipline(value);
          }
          setDisciplineMenuVisible(false);
        }}
        itemLabelFontSize={12}
        itemLabelFontWeight="400"
      />

      {/* Byggdel-picker renderas nu inuti Ny fråga-modalen som overlay (web) så att ESC bara stänger pickern */}

      {/* External group dropdown menu (web) */}
      <ContextMenu
        visible={externalGroupMenuVisible}
        x={externalGroupMenuPos.x}
        y={externalGroupMenuPos.y}
        items={externalGroupMenuItems}
        onClose={() => setExternalGroupMenuVisible(false)}
        onSelect={(item) => {
          const value = String(item?.value || '').trim();
          if (value === '__create__') {
            setExternalPersonGroupId('');
            setExternalPersonCreatingGroup(true);
            setExternalPersonNewGroupTitle('');
          } else {
            setExternalPersonGroupId(value);
            setExternalPersonCreatingGroup(false);
            setExternalPersonNewGroupTitle('');
          }
          setExternalGroupMenuVisible(false);
        }}
      />

      {/* Add external responsible person */}
      <Modal visible={externalPersonModalVisible} transparent animationType="fade" onRequestClose={() => setExternalPersonModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)', padding: 18, justifyContent: 'center' }}>
          <Pressable onPress={() => setExternalPersonModalVisible(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.20)' } : {}) }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(25,118,210,0.12)', borderWidth: 1, borderColor: 'rgba(25,118,210,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person-add-outline" size={16} color={COLORS.blue} />
                </View>
                <View style={{ minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: FW_MED, color: COLORS.text }} numberOfLines={1}>Lägg till ansvarig</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textSubtle }} numberOfLines={1}>Personen läggs till i projektets organisation</Text>
                </View>
              </View>
              <Pressable
                onPress={() => setExternalPersonModalVisible(false)}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.inputBorder,
                  backgroundColor: (hovered || pressed) ? 'rgba(25,118,210,0.06)' : '#fff',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Text style={{ color: COLORS.textMuted, fontWeight: FW_MED, fontSize: 12 }}>Stäng</Text>
              </Pressable>
            </View>

            <View style={{ padding: 14, gap: 10 }}>
              {externalPersonError ? (
                <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' }}>
                  <Text style={{ fontSize: 13, color: '#C62828' }}>{externalPersonError}</Text>
                </View>
              ) : null}

              {orgError ? (
                <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082' }}>
                  <Text style={{ fontSize: 13, color: '#5D4037' }}>Organisationen kunde inte laddas: {String(orgError || '')}</Text>
                </View>
              ) : null}

              <TextInput
                value={externalPersonName}
                onChangeText={setExternalPersonName}
                placeholder="Namn"
                placeholderTextColor={COLORS.textSubtle}
                style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
              />
              <TextInput
                value={externalPersonEmail}
                onChangeText={setExternalPersonEmail}
                placeholder="E-post"
                placeholderTextColor={COLORS.textSubtle}
                autoCapitalize="none"
                keyboardType={Platform.OS === 'web' ? 'default' : 'email-address'}
                style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
              />
              <TextInput
                value={externalPersonRole}
                onChangeText={setExternalPersonRole}
                placeholder="Roll (t.ex. Platschef, Projektör)"
                placeholderTextColor={COLORS.textSubtle}
                style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
              />

              <Pressable
                onPress={openExternalGroupMenu}
                disabled={orgLoading}
                style={({ hovered, pressed }) => ({
                  height: 44,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.inputBorder,
                  backgroundColor: '#fff',
                  opacity: orgLoading ? 0.75 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                  ...(pressed ? { opacity: 0.92 } : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Text style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: '400', color: COLORS.textMuted }} numberOfLines={1}>
                  <Text style={{ color: COLORS.textSubtle }}>Grupp </Text>
                  {(() => {
                    const groups = Array.isArray(orgGroups) ? orgGroups : [];
                    const selected = groups.find((g) => safeText(g?.id) === safeText(externalPersonGroupId)) || null;
                    const label = externalPersonCreatingGroup
                      ? '+ Skapa ny grupp'
                      : (safeText(selected?.title) || 'Välj grupp…');
                    const color = (!externalPersonCreatingGroup && safeText(selected?.title)) ? COLORS.text : COLORS.textMuted;
                    return <Text style={{ color }} numberOfLines={1}>{label}</Text>;
                  })()}
                </Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.textSubtle} />
              </Pressable>

              {externalPersonCreatingGroup ? (
                <TextInput
                  value={externalPersonNewGroupTitle}
                  onChangeText={setExternalPersonNewGroupTitle}
                  placeholder="Ny grupp (t.ex. Beställare, UE)"
                  placeholderTextColor={COLORS.textSubtle}
                  style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
                />
              ) : null}
            </View>

            <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable
                onPress={() => setExternalPersonModalVisible(false)}
                disabled={externalPersonSaving}
                style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: '#fff', opacity: externalPersonSaving ? 0.7 : 1 }}
              >
                <Text style={{ color: COLORS.textMuted, fontWeight: FW_MED }}>Avbryt</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!hasContext) return;
                  if (externalPersonSaving) return;
                  const name = safeText(externalPersonName);
                  const email = safeText(externalPersonEmail);
                  const role = safeText(externalPersonRole);
                  const emailNorm = normalizeEmail(email);

                  if (!name) { setExternalPersonError('Namn är obligatoriskt.'); return; }
                  if (!email) { setExternalPersonError('E-post är obligatoriskt.'); return; }
                  if (!role) { setExternalPersonError('Roll är obligatoriskt.'); return; }
                  if (!emailNorm) { setExternalPersonError('E-post är obligatoriskt.'); return; }
                  if (externalPersonCreatingGroup && !safeText(externalPersonNewGroupTitle)) { setExternalPersonError('Ny grupp är obligatorisk.'); return; }
                  if (!externalPersonCreatingGroup && !safeText(externalPersonGroupId)) { setExternalPersonError('Grupp är obligatoriskt.'); return; }

                  setExternalPersonSaving(true);
                  setExternalPersonError('');

                  try {
                    const groups = Array.isArray(orgGroups) ? orgGroups : [];

                    // Deduplicate by email across organisation
                    for (const g of groups) {
                      const gid0 = safeText(g?.id);
                      const members = Array.isArray(g?.members) ? g.members : [];
                      const hit = members.find((m) => normalizeEmail(m?.email) === emailNorm) || null;
                      if (hit && gid0 && safeText(hit?.id)) {
                        const k = responsibleKey(gid0, safeText(hit?.id));
                        const which = externalPersonTarget === 'form' ? 'form' : 'quick';
                        const current = which === 'form'
                          ? normalizeResponsibleKeys(formResponsibleKeys)
                          : normalizeResponsibleKeys(quickResponsibleKeys);
                        setResponsibleKeysFor(which, [...current, k]);
                        setExternalPersonModalVisible(false);
                        return;
                      }
                    }

                    let gid = safeText(externalPersonGroupId);
                    if (externalPersonCreatingGroup) {
                      const title = safeText(externalPersonNewGroupTitle);
                      const existing = groups.find((g) => String(g?.title || '').trim().toLowerCase() === title.toLowerCase()) || null;
                      gid = safeText(existing?.id);
                      if (!gid) {
                        const res = await addOrgGroup({ title });
                        gid = safeText(res?.id);
                        if (!gid) throw new Error('Kunde inte skapa grupp.');
                      }
                    }

                    if (!gid) throw new Error('Välj grupp.');

                    const candidate = {
                      source: 'external',
                      refId: uuidv4(),
                      name,
                      company: '',
                      email: emailNorm,
                      phone: '',
                    };

                    const addRes = await addOrgMember({ groupId: gid, candidate, role });
                    if (!addRes || addRes.ok === false) {
                      if (addRes?.reason === 'duplicate') throw new Error('Personen finns redan i gruppen.');
                      throw new Error('Kunde inte lägga till personen i organisationen.');
                    }

                    const mid = safeText(addRes?.member?.id);
                    const k = responsibleKey(gid, mid);
                    const which = externalPersonTarget === 'form' ? 'form' : 'quick';
                    const current = which === 'form'
                      ? normalizeResponsibleKeys(formResponsibleKeys)
                      : normalizeResponsibleKeys(quickResponsibleKeys);
                    setResponsibleKeysFor(which, [...current, k]);

                    setExternalPersonModalVisible(false);
                  } catch (e) {
                    setExternalPersonError(String(e?.message || e || 'Kunde inte lägga till person.'));
                  } finally {
                    setExternalPersonSaving(false);
                  }
                }}
                disabled={externalPersonSaving}
                style={({ hovered, pressed }) => ({
                  ...PRIMARY_ACTION_BUTTON_BASE,
                  opacity: externalPersonSaving ? 0.7 : 1,
                  ...(Platform.OS === 'web' && hovered ? { backgroundColor: COLORS.blueHover } : {}),
                  ...(pressed ? { opacity: 0.9 } : {}),
                })}
              >
                <Text style={{ color: '#fff', fontWeight: FW_MED }}>{externalPersonSaving ? 'Sparar…' : 'Spara person'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <FlatList
        data={listData}
        renderItem={renderListItem}
        keyExtractor={(x) => String(x?.key || Math.random())}
        stickyHeaderIndices={[0]}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 28 }}
      />

      {/* Date picker (same modal as Projektinformation) */}
      <IsoDatePickerModal
        visible={datePickerVisible}
        title="Välj datum"
        value={datePickerTarget === 'form' ? formNeedsAnswerBy : quickNeedsAnswerBy}
        onSelect={(iso) => {
          if (datePickerTarget === 'form') setFormNeedsAnswerBy(String(iso || '').trim());
          else setQuickNeedsAnswerBy(String(iso || '').trim());
          setDatePickerVisible(false);
        }}
        onClose={() => setDatePickerVisible(false)}
      />

      {/* Edit/Create modal. Vid ESC: onRequestClose läser overlayOpenRef – stäng bara den öppna pickern, annars closePanel. */}
      <Modal
        visible={panelVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          const open = overlayOpenRef.current;
          if (open === 'responsible') {
            setResponsiblePickerVisible(false);
            overlayOpenRef.current = null;
            return;
          }
          if (open === 'externalPerson') {
            setExternalPersonModalVisible(false);
            overlayOpenRef.current = null;
            return;
          }
          if (open === 'datePicker') {
            setDatePickerVisible(false);
            overlayOpenRef.current = null;
            return;
          }
          if (open === 'externalGroup') {
            setExternalGroupMenuVisible(false);
            overlayOpenRef.current = null;
            return;
          }
          if (open === 'discipline') {
            setDisciplineMenuVisible(false);
            overlayOpenRef.current = null;
            return;
          }
          if (open === 'byggdel') {
            setByggdelMenuVisible(false);
            overlayOpenRef.current = null;
            return;
          }
          closePanel();
        }}
      >
        <View style={{ flex: 1, backgroundColor: MODAL_DESIGN_2026.overlayBg, ...fsModalOverlayStyle }}>
          <Pressable onPress={closePanel} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

          {/* Byggdel-picker som overlay inuti modalen (web) – då hanterar en enda Modal ESC korrekt */}
          {Platform.OS === 'web' && byggdelMenuVisible ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
              <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.35)' }} onPress={() => setByggdelMenuVisible(false)} />
              <View
                style={{
                  width: '100%',
                  maxWidth: 420,
                  minHeight: 420,
                  maxHeight: '70vh',
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  overflow: 'hidden',
                  ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.2)' } : {}),
                }}
                onStartShouldSetResponder={() => true}
              >
                <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.text, marginBottom: 8 }}>Byggdel</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fff', gap: 8 }}>
                    <Ionicons name="search" size={14} color={COLORS.textSubtle} />
                    <TextInput
                      value={byggdelPickerSearch}
                      onChangeText={setByggdelPickerSearch}
                      placeholder="Sök byggdel, beskrivning, anteckningar…"
                      placeholderTextColor={COLORS.textSubtle}
                      style={{ flex: 1, fontSize: 13, color: COLORS.text, ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
                    />
                  </View>
                </View>
                <ScrollView
                  style={{ height: 320, minHeight: 320 }}
                  contentContainerStyle={{ padding: 8, paddingTop: 4 }}
                  keyboardShouldPersistTaps="handled"
                >
                  <Pressable
                    onPress={() => {
                      if (byggdelMenuFor === 'form') setFormBd('');
                      else setQuickBd('');
                      setByggdelMenuVisible(false);
                    }}
                    style={({ hovered, pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: pressed ? 'rgba(25,118,210,0.08)' : (hovered ? 'rgba(0,0,0,0.04)' : 'transparent'),
                      marginBottom: 4,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    })}
                  >
                    <Text style={{ fontSize: 13, color: COLORS.text }}>Ingen</Text>
                  </Pressable>
                  {(filteredByggdelarForPicker || []).map((b) => {
                    const code = String(b?.code ?? '').trim();
                    const name = String(b?.name ?? '').trim();
                    const label = name ? `${code} – ${name}` : code || '—';
                    const selected = (byggdelMenuFor === 'form' ? safeText(formBd) : safeText(quickBd)) === code;
                    return (
                      <Pressable
                        key={b?.id || code}
                        onPress={() => {
                          if (byggdelMenuFor === 'form') setFormBd(code);
                          else setQuickBd(code);
                          setByggdelMenuVisible(false);
                        }}
                        style={({ hovered, pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 8,
                          backgroundColor: pressed ? 'rgba(25,118,210,0.08)' : (hovered ? 'rgba(0,0,0,0.04)' : 'transparent'),
                          marginBottom: 4,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        })}
                      >
                        <Text style={{ flex: 1, fontSize: 13, color: COLORS.text }} numberOfLines={1}>{label}</Text>
                        {selected ? <Ionicons name="checkmark" size={16} color={COLORS.blue} /> : null}
                      </Pressable>
                    );
                  })}
                  {filteredByggdelarForPicker.length === 0 && byggdelarList.length > 0 ? (
                    <Text style={{ fontSize: 12, color: COLORS.textMuted, paddingVertical: 12, paddingHorizontal: 10 }}>Inga träffar. Prova ett annat sökord.</Text>
                  ) : null}
                </ScrollView>
              </View>
            </View>
          ) : null}

          {/* Ansvariga-picker som overlay inuti modalen – då finns bara en Modal och ESC stänger bara pickern */}
          {responsiblePickerVisible ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 1001 }}>
              <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.35)' }} onPress={() => setResponsiblePickerVisible(false)} />
              <View style={{ width: '100%', maxWidth: 720, maxHeight: '78vh', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.20)' } : {}) }}>
                <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(25,118,210,0.12)', borderWidth: 1, borderColor: 'rgba(25,118,210,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="people-outline" size={14} color={COLORS.blue} />
                    </View>
                    <View style={{ minWidth: 0 }}>
                      <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.text }} numberOfLines={1}>Ansvariga</Text>
                      <Text style={{ fontSize: 11, color: COLORS.textSubtle }} numberOfLines={1}>Välj en eller flera personer</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setResponsiblePickerVisible(false)} style={({ hovered, pressed }) => ({ paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: '#fff', ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}), ...(pressed ? { opacity: 0.9 } : {}), ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) })}>
                    <Ionicons name="close" size={16} color={COLORS.textSubtle} />
                  </Pressable>
                </View>
                <View style={{ padding: 12, gap: 8 }}>
                  <View style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="search" size={14} color={COLORS.textSubtle} />
                    <TextInput value={responsiblePickerSearch} onChangeText={setResponsiblePickerSearch} placeholder="Sök namn, e-post eller roll…" placeholderTextColor={COLORS.textSubtle} style={{ flex: 1, fontSize: 13, color: COLORS.text, ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }} />
                  </View>
                  {(() => {
                    const pending = normalizeResponsibleKeys(responsiblePickerPendingKeys);
                    if (pending.length === 0) return null;
                    return (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {pending.map((k) => {
                          const resolved = findResponsibleByKey(orgGroups, k);
                          const name = safeText(resolved?.member?.name) || '—';
                          return (
                            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: 'rgba(25,118,210,0.06)' }}>
                              <Text style={{ fontSize: 11, color: COLORS.text }} numberOfLines={1}>{name}</Text>
                              <Pressable onPress={() => setResponsiblePickerPendingKeys((prev) => normalizeResponsibleKeys(prev).filter((x) => x !== k))} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) })}>
                                <Ionicons name="close" size={12} color={COLORS.textSubtle} />
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}
                </View>
                <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 0 }}>
                  {orgError ? (
                    <View style={{ padding: 8, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 8, marginBottom: 10 }}>
                      <Text style={{ color: '#991B1B', fontSize: 12 }}>{String(orgError || 'Kunde inte ladda organisationen.')}</Text>
                    </View>
                  ) : null}
                  {filteredResponsibleGroups.length === 0 ? (
                    <View style={{ paddingVertical: 10 }}>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Inga träffar.</Text>
                    </View>
                  ) : null}
                  {filteredResponsibleGroups.map((g) => {
                    const gid = safeText(g?.id);
                    const gtitle = safeText(g?.title) || 'Grupp';
                    const isInternalGroup = !!g?.isInternalMainGroup;
                    const isOpen = isInternalGroup || !!responsibleGroupOpen[gid];
                    const members = Array.isArray(g?.members) ? g.members : [];
                    return (
                      <View key={gid || gtitle} style={{ marginBottom: 12 }}>
                        <Pressable onPress={() => { if (isInternalGroup) return; setResponsibleGroupOpen((prev) => ({ ...prev, [gid]: !prev[gid] })); }} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, backgroundColor: (Platform.OS === 'web' && hovered && !isInternalGroup) ? 'rgba(0,0,0,0.04)' : 'transparent', ...(Platform.OS === 'web' && !isInternalGroup ? { cursor: 'pointer' } : {}) })}>
                          <Text style={{ fontSize: 11, fontWeight: FW_MED, color: COLORS.textSubtle }}>{gtitle}</Text>
                          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSubtle} />
                        </Pressable>
                        {isOpen ? (
                          <View style={{ borderWidth: 1, borderColor: COLORS.tableBorder, borderRadius: 10, overflow: 'hidden' }}>
                            {members.map((m, idx) => {
                              const mid = safeText(m?.id);
                              const k = responsibleKey(gid, mid);
                              const pending = normalizeResponsibleKeys(responsiblePickerPendingKeys);
                              const selected = pending.includes(k);
                              const name = safeText(m?.name) || '—';
                              return (
                                <Pressable
                                  key={k || `${gid}:${idx}`}
                                  onPress={() => setResponsiblePickerPendingKeys((prev) => { const norm = normalizeResponsibleKeys(prev); if (norm.includes(k)) return norm.filter((x) => x !== k); return [...norm, k]; })}
                                  style={({ hovered, pressed }) => ({ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: pressed ? 'rgba(25,118,210,0.06)' : (Platform.OS === 'web' && hovered ? 'rgba(25,118,210,0.04)' : '#fff'), borderBottomWidth: idx === members.length - 1 ? 0 : 1, borderBottomColor: COLORS.tableBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) })}
                                >
                                  <Text style={{ flex: 1, minWidth: 0, fontSize: 12, color: COLORS.text }} numberOfLines={1}>{name}</Text>
                                  <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={16} color={selected ? COLORS.blue : COLORS.textSubtle} />
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                  <View style={{ marginTop: 6 }}>
                    <Pressable
                      onPress={() => { setResponsiblePickerVisible(false); setExternalPersonTarget(responsiblePickerFor === 'form' ? 'form' : 'quick'); setExternalPersonError(''); setExternalPersonName(''); setExternalPersonEmail(''); setExternalPersonRole(''); setExternalPersonCreatingGroup(false); setExternalPersonNewGroupTitle(''); const groups = Array.isArray(orgGroups) ? orgGroups : []; const intern = groups.find((gr) => String(gr?.title || '').trim().toLowerCase() === 'intern') || null; setExternalPersonGroupId(safeText(intern?.id) || safeText(groups?.[0]?.id) || ''); overlayOpenRef.current = 'externalPerson'; setExternalPersonModalVisible(true); }}
                      style={({ hovered, pressed }) => ({ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: pressed ? 'rgba(25,118,210,0.06)' : '#fff', flexDirection: 'row', alignItems: 'center', gap: 8, ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}), ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) })}
                    >
                      <Ionicons name="person-add-outline" size={16} color={COLORS.blue} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: COLORS.text, fontWeight: FW_MED, fontSize: 12 }} numberOfLines={1}>Lägg till person utanför projektet…</Text>
                        <Text style={{ marginTop: 2, color: COLORS.textMuted, fontSize: 11 }} numberOfLines={1}>Läggs till i organisationen och kan väljas framöver</Text>
                      </View>
                    </Pressable>
                  </View>
                </ScrollView>
                <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  <Pressable onPress={() => setResponsiblePickerVisible(false)} style={({ hovered, pressed }) => ({ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: '#fff', ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}), ...(pressed ? { opacity: 0.9 } : {}), ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) })}>
                    <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Avbryt</Text>
                  </Pressable>
                  <Pressable onPress={() => { const which = responsiblePickerFor === 'form' ? 'form' : 'quick'; setResponsibleKeysFor(which, normalizeResponsibleKeys(responsiblePickerPendingKeys)); setResponsiblePickerVisible(false); }} style={({ hovered, pressed }) => ({ ...PRIMARY_ACTION_BUTTON_BASE, paddingVertical: 8, paddingHorizontal: 12, ...(Platform.OS === 'web' && hovered ? { backgroundColor: COLORS.blueHover } : {}), ...(pressed ? { opacity: 0.9 } : {}), ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) })}>
                    <Text style={{ color: '#fff', fontWeight: FW_MED, fontSize: 12 }}>Lägg till</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          <View
            style={{
              width: '100%',
              maxWidth: 980,
              alignSelf: 'center',
              backgroundColor: '#fff',
              borderRadius: MODAL_DESIGN_2026.radius,
              overflow: 'hidden',
              zIndex: 0,
              ...(Platform.OS === 'web'
                ? { boxShadow: MODAL_DESIGN_2026.shadow, display: 'flex', flexDirection: 'column' }
                : { maxHeight: '90%' }),
              ...fsModalBoxStyle,
            }}
          >
            {fsModalResizeHandles}

            {/* Banner – compact blue, draggable */}
            <View
              {...fsModalHeaderProps}
              style={{
                backgroundColor: 'rgba(25, 118, 210, 0.12)',
                borderLeftWidth: 4,
                borderLeftColor: '#1976D2',
                paddingVertical: 6,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 36,
                ...(fsModalHeaderProps?.style || {}),
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: FW_MED, color: '#0F172A' }}>{editingId ? 'Fråga / Svar' : 'Ny fråga'}</Text>
              <Pressable
                onPress={closePanel}
                style={({ hovered }) => ({
                  padding: 4, borderRadius: 6,
                  backgroundColor: hovered ? 'rgba(0,0,0,0.06)' : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Ionicons name="close" size={18} color="#64748b" />
              </Pressable>
            </View>

            {/* Metadata row below banner */}
            {editingId ? (() => {
              const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(editingId));
              if (!current) return null;
              const createdBy = safeText(current?.createdByName) || 'Okänd användare';
              const createdAtDate = toDateSafe(current?.createdAt);
              const updatedAtDate = toDateSafe(current?.updatedAt);
              const fmtDate = (d) => d ? new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) : '';
              const fmtTime = (d) => d ? new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(d) : '';
              return (
                <View style={{ paddingVertical: 5, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#FAFBFC', gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="person-outline" size={12} color="#64748b" />
                    <Text style={{ fontSize: 12, color: '#64748b' }}>Skapad av: <Text style={{ color: '#1e293b', fontWeight: '600' }}>{createdBy}</Text></Text>
                  </View>
                  {createdAtDate ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="calendar-outline" size={12} color="#64748b" />
                      <Text style={{ fontSize: 12, color: '#64748b' }}>Datum: {fmtDate(createdAtDate)} Kl: {fmtTime(createdAtDate)}</Text>
                    </View>
                  ) : null}
                  {updatedAtDate ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="refresh-outline" size={12} color="#64748b" />
                      <Text style={{ fontSize: 12, color: '#64748b' }}>Senast uppdaterad: {fmtDate(updatedAtDate)} Kl: {fmtTime(updatedAtDate)}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })() : null}

            {/* Content */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, backgroundColor: '#fff' }}>
              {/* FRÅGA */}
              <View style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                {/* Meta row: rubrik till vänster, fält till höger */}
                <View style={{ marginBottom: 10, gap: 8 }}>
                  {/* Byggdel */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 92, fontSize: 12, fontWeight: '500', color: COLORS.textSubtle }}>Byggdel</Text>
                    <Pressable
                      onPress={(e) => openByggdelMenu(e, 'form')}
                      style={({ hovered, pressed }) => ({
                        flex: 1,
                        minWidth: 0,
                        height: 32,
                        borderWidth: 1,
                        borderColor: COLORS.inputBorder,
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        backgroundColor: '#fff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                        ...(pressed ? { opacity: 0.92 } : {}),
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      })}
                    >
                      <Text style={{ flex: 1, minWidth: 0, fontSize: 13, color: formBd ? COLORS.text : COLORS.textSubtle }} numberOfLines={1}>
                        {formBd
                          ? (() => {
                              const b = (Array.isArray(byggdelarList) ? byggdelarList : []).find((x) => String(x?.code ?? '').trim() === String(formBd).trim());
                              const name = b ? String(b?.name ?? '').trim() : '';
                              return name ? `${formBd} – ${name}` : formBd;
                            })()
                          : 'Välj byggdel…'}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={COLORS.textSubtle} />
                    </Pressable>
                  </View>
                  {/* Disciplin */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 92, fontSize: 12, fontWeight: '500', color: COLORS.textSubtle }}>Disciplin</Text>
                    <Pressable
                      onPress={(e) => openDisciplineMenu(e, 'form')}
                      style={({ hovered, pressed }) => ({
                        flex: 1,
                        minWidth: 0,
                        height: 32,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: COLORS.inputBorder,
                        backgroundColor: '#fff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                        ...(pressed ? { opacity: 0.92 } : {}),
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      })}
                    >
                      <Text style={{ flex: 1, minWidth: 0, fontSize: 13, color: COLORS.text }} numberOfLines={1}>
                        {normalizeDiscipline(formDiscipline) || 'Intern'}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={COLORS.textSubtle} />
                    </Pressable>
                  </View>
                  {/* Tilldela till */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 92, fontSize: 12, fontWeight: '500', color: COLORS.textSubtle }}>Tilldela till</Text>
                    <Pressable
                      onPress={() => openResponsiblePicker('form')}
                      disabled={orgLoading}
                      style={({ hovered, pressed }) => ({
                        flex: 1,
                        minWidth: 0,
                        paddingHorizontal: 8,
                        minHeight: 32,
                        paddingVertical: 6,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: COLORS.inputBorder,
                        backgroundColor: '#fff',
                        opacity: orgLoading ? 0.75 : 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                        ...(pressed ? { opacity: 0.92 } : {}),
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      })}
                    >
                      <Text style={{ flex: 1, minWidth: 0, fontSize: 13, color: (normalizeResponsibleKeys(formResponsibleKeys) || []).length ? COLORS.text : COLORS.textSubtle }} numberOfLines={2}>
                        {orgLoading ? 'Laddar…' : ((normalizeResponsibleKeys(formResponsibleKeys) || []).length ? formatResponsibleSummary(formResponsibleKeys) : 'Välj personer…')}
                      </Text>
                      <Ionicons name="people-outline" size={14} color={COLORS.textSubtle} />
                    </Pressable>
                  </View>
                  {/* Svar senast */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 92, fontSize: 12, fontWeight: '500', color: COLORS.textSubtle }}>Svar senast</Text>
                    <Pressable
                      onPress={() => openDatePicker('form')}
                      style={({ hovered, pressed }) => ({
                        flex: 1,
                        minWidth: 0,
                        height: 32,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: COLORS.inputBorder,
                        backgroundColor: '#fff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                        ...(pressed ? { opacity: 0.92 } : {}),
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      })}
                    >
                      <Text style={{ flex: 1, minWidth: 0, fontSize: 13, color: formNeedsAnswerBy ? COLORS.text : COLORS.textSubtle }} numberOfLines={1}>
                        {normalizeDateYmd(formNeedsAnswerBy) || '—'}
                      </Text>
                      <Ionicons name="calendar-outline" size={14} color={COLORS.textSubtle} />
                    </Pressable>
                  </View>
                </View>

                <Text style={{ fontSize: 11, color: COLORS.textSubtle, fontWeight: '500', marginBottom: 4 }}>Rubrik</Text>
                <TextInput
                  value={formTitle}
                  onChangeText={setFormTitle}
                  placeholder="Rubrik (t.ex. 'Brandklass dörrar')"
                  placeholderTextColor={COLORS.textSubtle}
                  style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 6, backgroundColor: '#fff', paddingVertical: 5, paddingHorizontal: 8, minHeight: 32, fontSize: 13, color: COLORS.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }}
                />

                <Text style={{ fontSize: 11, color: COLORS.textSubtle, fontWeight: '500', marginBottom: 4, marginTop: 10 }}>Fråga / Beskrivning *</Text>
                <TextInput
                  value={formQuestion}
                  onChangeText={setFormQuestion}
                  placeholder="Skriv frågan/beskrivningen…"
                  placeholderTextColor={COLORS.textSubtle}
                  multiline
                  scrollEnabled={false}
                  onContentSizeChange={(e) => {
                    const raw = Number(e?.nativeEvent?.contentSize?.height || 0);
                    if (!Number.isFinite(raw) || raw <= 0) return;
                    const pad = Platform.OS === 'web' ? 0 : 18;
                    const next = Math.max(56, Math.ceil(raw + pad));
                    setQuestionInputHeight((prev) => (Math.abs(Number(prev) - next) >= 2 ? next : prev));
                  }}
                  style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 6, backgroundColor: '#fff', paddingVertical: 5, paddingHorizontal: 8, minHeight: 56, height: questionInputHeight, fontSize: 13, color: COLORS.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }}
                />

                {/* Question attachments */}
                <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textSubtle, fontWeight: FW_MED }}>Bilagor (Fråga)</Text>
                  <Pressable
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        Alert.alert('Lägg till filer', 'Filbifogning är tillgängligt i webbläget.');
                        return;
                      }

                      setUploadError('');

                      // IMPORTANT (web): the file picker must be opened synchronously from the user gesture.
                      // Start SharePoint ensure in background; we will await it after file selection.
                      try {
                        const id = safeText(editingId);
                        formEnsureRef.current = {
                          id,
                          promise: id ? ensureEditingFolderPath() : resolveFragaSvarRootPath().then(() => null),
                        };
                        formEnsureRef.current.promise.catch((e) => {
                          reportSharePointFailure('Kunde inte förbereda filuppladdning i SharePoint', e, { fsId: id || null });
                          setUploadError('SharePoint-synk misslyckades. Bilagor är spärrade tills SharePoint fungerar.');
                        });
                      } catch (_e) {}

                      try { questionFileInputRef.current?.click?.(); } catch (_e) {}
                    }}
                    disabled={uploadingFiles}
                    style={({ hovered, pressed }) => ({
                      paddingVertical: 5,
                      paddingHorizontal: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: COLORS.tableBorder,
                      backgroundColor: '#fff',
                      opacity: uploadingFiles ? 0.5 : 1,
                      ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                      ...(pressed ? { opacity: 0.9 } : {}),
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    })}
                  >
                    <Text style={{ color: COLORS.blue, fontWeight: FW_MED, fontSize: 12 }}>{uploadingFiles ? 'Lägger till…' : '+ Lägg till filer'}</Text>
                  </Pressable>
                </View>

                {Platform.OS === 'web' ? (
                  <input
                    ref={questionFileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const list = Array.from(e?.target?.files || []);
                      if (e?.target) e.target.value = '';

                      // Create-mode: stage locally and upload on save
                      if (!editingId) {
                        addFormStagedQuestionFiles(list);
                        return;
                      }

                      (async () => {
                        try {
                          const ensured = (formEnsureRef.current && safeText(formEnsureRef.current.id) === safeText(editingId))
                            ? await formEnsureRef.current.promise.catch(() => null)
                            : null;
                          const folderPath = safeText(ensured) || await ensureEditingFolderPath();
                          await uploadAndAttachFiles({
                            files: list,
                            targetFolderPath: folderPath,
                            setAttachments: setFormAttachments,
                            setIsUploading: setUploadingFiles,
                            setErr: setUploadError,
                            setDrag: () => {},
                            inputRef: questionFileInputRef,
                            attachedIn: 'question',
                          });

                          const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(editingId));
                          if (current) await refreshFilesForItem(current);
                        } catch (err) {
                          setUploadError(String(err?.message || err || 'Kunde inte lägga till fil.'));
                        }
                      })();
                    }}
                  />
                ) : null}

                {(() => {
                  const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(editingId));
                  const currentId = safeText(current?.id);
                  const hasLiveKey = currentId ? Object.prototype.hasOwnProperty.call(fsFolderFilesById || {}, currentId) : false;
                  const live = currentId ? fsFolderFilesById?.[currentId] : null;

                  const remoteAll = (editingId && hasLiveKey && Array.isArray(live))
                    ? mergeLiveFilesWithAttachments(live, formAttachments)
                    : uniqAttachments(Array.isArray(formAttachments) ? formAttachments : []);

                  const remoteFiles = (Array.isArray(remoteAll) ? remoteAll : []).filter((f) => normalizeAttachedIn(f?.attachedIn) === 'question');
                  const staged = (!editingId && Platform.OS === 'web') ? uniqFiles(formStagedQuestionFiles) : [];

                  const files = [
                    ...staged.map((f) => ({ type: 'local', file: f })),
                    ...remoteFiles,
                  ];

                  if (files.length === 0) return null;

                  return (
                    <View style={{ marginTop: 8, borderWidth: 1, borderColor: COLORS.tableBorder, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
                      <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: COLORS.bgMuted, borderBottomWidth: 1, borderBottomColor: COLORS.tableBorder }}>
                        <Text style={{ flex: 2, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Filnamn</Text>
                        <Text style={{ width: 70, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Filtyp</Text>
                        <Text style={{ flex: 1, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Uppladdad av</Text>
                        <Text style={{ width: 120, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED, textAlign: 'right' }} numberOfLines={1}>Datum</Text>
                        <Text style={{ width: 34, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED, textAlign: 'right' }} numberOfLines={1} />
                      </View>

                      {files.map((f, i) => {
                        const isLocal = f?.type === 'local' && f?.file;
                        const row = isLocal
                          ? {
                            name: safeText(f?.file?.name) || 'Fil',
                            webUrl: null,
                            downloadUrl: null,
                            fileTypeLabel: fileTypeFromName(f?.file?.name) || 'Fil',
                            uploadedBy: safeText(auth?.currentUser?.displayName) || safeText(auth?.currentUser?.email) || '—',
                            dateText: 'Ej uppladdad',
                          }
                          : (f?.downloadUrl || f?.createdBy
                            ? toTableRowFromLiveFile(f)
                            : toTableRowFromAttachment(f));

                        return (
                          <Pressable
                            key={fileTableRowKey(row, i)}
                            onPress={() => {
                              if (isLocal) {
                                openPreviewForLocalFile(f?.file);
                                return;
                              }
                              openPreview({ name: row.name, webUrl: row.webUrl, downloadUrl: row.downloadUrl });
                            }}
                            style={({ hovered, pressed }) => ({
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 7,
                              paddingHorizontal: 10,
                              borderBottomWidth: i === files.length - 1 ? 0 : 1,
                              borderBottomColor: COLORS.tableBorder,
                              backgroundColor: pressed ? 'rgba(25,118,210,0.06)' : (Platform.OS === 'web' && hovered ? 'rgba(25,118,210,0.04)' : '#fff'),
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                            })}
                          >
                            <Text style={{ flex: 2, color: COLORS.blue, fontSize: 13 }} numberOfLines={1}>{row.name}</Text>
                            <Text style={{ width: 70, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>{row.fileTypeLabel}</Text>
                            <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>{row.uploadedBy}</Text>
                            <Text style={{ width: 120, color: COLORS.textMuted, fontSize: 12, textAlign: 'right' }} numberOfLines={1}>{row.dateText}</Text>
                            {isLocal ? (
                              <Pressable
                                onPress={(e) => {
                                  stopPressPropagation(e);
                                  removeFormStagedQuestionFile(fileKey(f?.file));
                                }}
                                style={({ hovered, pressed }) => ({
                                  width: 34,
                                  alignItems: 'flex-end',
                                  opacity: pressed ? 0.8 : 1,
                                  ...(Platform.OS === 'web' && hovered ? { opacity: 0.9 } : {}),
                                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                                })}
                              >
                                <Ionicons name="close" size={14} color={COLORS.textSubtle} />
                              </Pressable>
                            ) : (
                              <Pressable
                                onPress={(e) => {
                                  stopPressPropagation(e);
                                  void openDownload({ name: row.name, webUrl: row.webUrl, downloadUrl: row.downloadUrl });
                                }}
                                style={({ hovered, pressed }) => ({
                                  width: 34,
                                  alignItems: 'flex-end',
                                  opacity: pressed ? 0.8 : 1,
                                  ...(Platform.OS === 'web' && hovered ? { opacity: 0.9 } : {}),
                                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                                })}
                              >
                                <Ionicons name="download-outline" size={16} color={COLORS.textSubtle} />
                              </Pressable>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })()}

                {!editingId && (Array.isArray(formStagedQuestionFiles) ? formStagedQuestionFiles : []).length > 0 ? (
                  <Text style={{ marginTop: 8, fontSize: 12, color: COLORS.textSubtle }}>
                    Filerna laddas upp till SharePoint när du trycker "Spara".
                  </Text>
                ) : null}
                </View>
              </View>

              {/* Separator */}
              <View style={{ marginVertical: 10, height: 1, backgroundColor: COLORS.borderStrong, borderRadius: 1 }} />

              {/* SVAR */}
              <View style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textSubtle, fontWeight: '500' }}>Svar</Text>
                  {(() => {
                    const currentItem = items.find((x) => String(x?.id || '').trim() === String(editingId || '').trim());
                    const byRaw = safeText(currentItem?.answeredByName);
                    const answeredAtDate = toDateSafe(currentItem?.answeredAt);
                    if (!byRaw && !answeredAtDate) return null;
                    const fmtD = (d) => d ? new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) : '';
                    const fmtT = (d) => d ? new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(d) : '';
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="chatbubble-ellipses-outline" size={12} color="#64748b" />
                        <Text style={{ fontSize: 11, color: '#64748b' }} numberOfLines={1}>
                          Besvarad av: <Text style={{ fontWeight: '600', color: '#334155' }}>{byRaw || 'Okänd'}</Text>
                          {answeredAtDate ? ` · ${fmtD(answeredAtDate)} Kl: ${fmtT(answeredAtDate)}` : ''}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
                <TextInput
                  ref={answerInputRef}
                  value={formAnswer}
                  onChangeText={setFormAnswer}
                  placeholder="Skriv svar…"
                  placeholderTextColor={COLORS.textSubtle}
                  multiline
                  scrollEnabled={false}
                  onContentSizeChange={(e) => {
                    const raw = Number(e?.nativeEvent?.contentSize?.height || 0);
                    if (!Number.isFinite(raw) || raw <= 0) return;
                    const pad = Platform.OS === 'web' ? 0 : 18;
                    const next = Math.max(72, Math.ceil(raw + pad));
                    setAnswerInputHeight((prev) => (Math.abs(Number(prev) - next) >= 2 ? next : prev));
                  }}
                  style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 6, backgroundColor: '#fff', paddingVertical: 5, paddingHorizontal: 8, minHeight: 72, height: answerInputHeight, fontSize: 13, color: COLORS.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }}
                />

                {(Array.isArray(formAnswersHistory) ? formAnswersHistory : []).length > 0 ? (
                  <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.tableBorder, backgroundColor: COLORS.bgMuted }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: FW_MED, marginBottom: 6 }}>
                      Svarhistorik ({(Array.isArray(formAnswersHistory) ? formAnswersHistory : []).length})
                    </Text>
                    {(Array.isArray(formAnswersHistory) ? [...formAnswersHistory] : [])
                      .map((x) => {
                        const d = toDateSafe(x?.answeredAt);
                        return { ...x, _t: d ? d.getTime() : 0 };
                      })
                      .sort((a, b) => (b._t - a._t))
                      .slice(0, 5)
                      .map((x, i) => (
                        <View key={`${x?._t}-${i}`} style={{ marginBottom: i === 4 ? 0 : 8 }}>
                          <Text style={{ color: COLORS.textSubtle, fontSize: 12 }} numberOfLines={1}>
                            {safeText(x?.answeredByName) || 'Okänd användare'}{x?._t ? ` · ${formatDateTime(x?.answeredAt)}` : ''}
                          </Text>
                          <Text style={{ color: COLORS.text, fontSize: 13, marginTop: 2 }}>
                            {safeText(x?.text)}
                          </Text>
                        </View>
                      ))}
                    {(Array.isArray(formAnswersHistory) ? formAnswersHistory : []).length > 5 ? (
                      <Text style={{ color: COLORS.textSubtle, fontSize: 12 }}>… fler svar finns i historiken</Text>
                    ) : null}
                  </View>
                ) : null}
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textSubtle, fontWeight: '500', marginBottom: 4 }}>Status</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {STATUSES.map((s) => (
                      <Pill key={s} label={displayStatusLabel(s)} active={formStatus === s} onPress={() => setFormStatus(s)} />
                    ))}
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textSubtle, fontWeight: FW_MED }}>Bilagor (Svar)</Text>
                  <Pressable
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        Alert.alert('Lägg till filer', 'Filbifogning är tillgängligt i webbläget.');
                        return;
                      }

                      setUploadError('');

                      // IMPORTANT (web): the file picker must be opened synchronously from the user gesture.
                      // Start SharePoint ensure in background; we will await it after file selection.
                      try {
                        const id = safeText(editingId);
                        formEnsureRef.current = {
                          id,
                          promise: id ? ensureEditingFolderPath() : resolveFragaSvarRootPath().then(() => null),
                        };
                        formEnsureRef.current.promise.catch((e) => {
                          reportSharePointFailure('Kunde inte förbereda filuppladdning i SharePoint', e, { fsId: id || null });
                          setUploadError('SharePoint-synk misslyckades. Bilagor är spärrade tills SharePoint fungerar.');
                        });
                      } catch (_e) {}

                      try { answerFileInputRef.current?.click?.(); } catch (_e) {}
                    }}
                    disabled={uploadingFiles}
                    style={({ hovered, pressed }) => ({
                      paddingVertical: 5,
                      paddingHorizontal: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: COLORS.tableBorder,
                      backgroundColor: '#fff',
                      opacity: uploadingFiles ? 0.5 : 1,
                      ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                      ...(pressed ? { opacity: 0.9 } : {}),
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    })}
                  >
                    <Text style={{ color: COLORS.blue, fontWeight: FW_MED, fontSize: 12 }}>{uploadingFiles ? 'Lägger till…' : '+ Lägg till filer'}</Text>
                  </Pressable>
                </View>

                {Platform.OS === 'web' ? (
                  <input
                    ref={answerFileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const list = Array.from(e?.target?.files || []);
                      if (e?.target) e.target.value = '';

                      // Create-mode: stage locally and upload on save
                      if (!editingId) {
                        addFormStagedAnswerFiles(list);
                        return;
                      }

                      (async () => {
                        try {
                          const ensured = (formEnsureRef.current && safeText(formEnsureRef.current.id) === safeText(editingId))
                            ? await formEnsureRef.current.promise.catch(() => null)
                            : null;
                          const folderPath = safeText(ensured) || await ensureEditingFolderPath();
                          await uploadAndAttachFiles({
                            files: list,
                            targetFolderPath: folderPath,
                            setAttachments: setFormAttachments,
                            setIsUploading: setUploadingFiles,
                            setErr: setUploadError,
                            setDrag: () => {},
                            inputRef: answerFileInputRef,
                            attachedIn: 'answer',
                          });

                          const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(editingId));
                          if (current) await refreshFilesForItem(current);
                        } catch (err) {
                          setUploadError(String(err?.message || err || 'Kunde inte lägga till fil.'));
                        }
                      })();
                    }}
                  />
                ) : null}

                {uploadError ? (
                  <View style={{ padding: 10, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 10, marginBottom: 10 }}>
                    <Text style={{ color: '#991B1B', fontSize: 13 }}>{uploadError}</Text>
                  </View>
                ) : null}

                {(() => {
                  const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(editingId));
                  const currentId = safeText(current?.id);
                  const hasLiveKey = currentId ? Object.prototype.hasOwnProperty.call(fsFolderFilesById || {}, currentId) : false;
                  const live = currentId ? fsFolderFilesById?.[currentId] : null;

                  const remoteAll = (editingId && hasLiveKey && Array.isArray(live))
                    ? mergeLiveFilesWithAttachments(live, formAttachments)
                    : uniqAttachments(Array.isArray(formAttachments) ? formAttachments : []);

                  const remoteFiles = (Array.isArray(remoteAll) ? remoteAll : []).filter((f) => normalizeAttachedIn(f?.attachedIn) === 'answer');
                  const staged = (!editingId && Platform.OS === 'web') ? uniqFiles(formStagedAnswerFiles) : [];

                  const files = [
                    ...staged.map((f) => ({ type: 'local', file: f })),
                    ...remoteFiles,
                  ];

                  if (files.length === 0) return null;

                  return (
                    <View style={{ marginTop: 8, borderWidth: 1, borderColor: COLORS.tableBorder, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
                      <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: COLORS.bgMuted, borderBottomWidth: 1, borderBottomColor: COLORS.tableBorder }}>
                        <Text style={{ flex: 2, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Filnamn</Text>
                        <Text style={{ width: 70, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Filtyp</Text>
                        <Text style={{ flex: 1, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Uppladdad av</Text>
                        <Text style={{ width: 120, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED, textAlign: 'right' }} numberOfLines={1}>Datum</Text>
                        <Text style={{ width: 34, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED, textAlign: 'right' }} numberOfLines={1} />
                      </View>

                      {files.map((f, i) => {
                        const isLocal = f?.type === 'local' && f?.file;
                        const row = isLocal
                          ? {
                            name: safeText(f?.file?.name) || 'Fil',
                            webUrl: null,
                            downloadUrl: null,
                            fileTypeLabel: fileTypeFromName(f?.file?.name) || 'Fil',
                            uploadedBy: safeText(auth?.currentUser?.displayName) || safeText(auth?.currentUser?.email) || '—',
                            dateText: 'Ej uppladdad',
                          }
                          : (f?.downloadUrl || f?.createdBy
                            ? toTableRowFromLiveFile(f)
                            : toTableRowFromAttachment(f));

                        return (
                          <Pressable
                            key={fileTableRowKey(row, i)}
                            onPress={() => {
                              if (isLocal) {
                                openPreviewForLocalFile(f?.file);
                                return;
                              }
                              openPreview({ name: row.name, webUrl: row.webUrl, downloadUrl: row.downloadUrl });
                            }}
                            style={({ hovered, pressed }) => ({
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 7,
                              paddingHorizontal: 10,
                              borderBottomWidth: i === files.length - 1 ? 0 : 1,
                              borderBottomColor: COLORS.tableBorder,
                              backgroundColor: pressed ? 'rgba(25,118,210,0.06)' : (Platform.OS === 'web' && hovered ? 'rgba(25,118,210,0.04)' : '#fff'),
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                            })}
                          >
                            <Text style={{ flex: 2, color: COLORS.blue, fontSize: 13 }} numberOfLines={1}>{row.name}</Text>
                            <Text style={{ width: 70, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>{row.fileTypeLabel}</Text>
                            <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>{row.uploadedBy}</Text>
                            <Text style={{ width: 120, color: COLORS.textMuted, fontSize: 12, textAlign: 'right' }} numberOfLines={1}>{row.dateText}</Text>
                            {isLocal ? (
                              <Pressable
                                onPress={(e) => {
                                  stopPressPropagation(e);
                                  removeFormStagedAnswerFile(fileKey(f?.file));
                                }}
                                style={({ hovered, pressed }) => ({
                                  width: 34,
                                  alignItems: 'flex-end',
                                  opacity: pressed ? 0.8 : 1,
                                  ...(Platform.OS === 'web' && hovered ? { opacity: 0.9 } : {}),
                                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                                })}
                              >
                                <Ionicons name="close" size={14} color={COLORS.textSubtle} />
                              </Pressable>
                            ) : (
                              <Pressable
                                onPress={(e) => {
                                  stopPressPropagation(e);
                                  void openDownload({ name: row.name, webUrl: row.webUrl, downloadUrl: row.downloadUrl });
                                }}
                                style={({ hovered, pressed }) => ({
                                  width: 34,
                                  alignItems: 'flex-end',
                                  opacity: pressed ? 0.8 : 1,
                                  ...(Platform.OS === 'web' && hovered ? { opacity: 0.9 } : {}),
                                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                                })}
                              >
                                <Ionicons name="download-outline" size={16} color={COLORS.textSubtle} />
                              </Pressable>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })()}

                {!editingId && (Array.isArray(formStagedAnswerFiles) ? formStagedAnswerFiles : []).length > 0 ? (
                  <Text style={{ marginTop: 8, fontSize: 12, color: COLORS.textSubtle }}>
                    Filerna laddas upp till SharePoint när du trycker "Spara".
                  </Text>
                ) : null}
                </View>
              </View>
            </ScrollView>

            {/* Footer – Golden Rules */}
            <View style={{ ...MODAL_DESIGN_2026.footer, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {editingId && canDeleteFs ? (
                deletingFsId === editingId ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: MODAL_DESIGN_2026.buttonPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.buttonPaddingHorizontal }}>
                    <ActivityIndicator size="small" color={COLORS.danger} />
                    <Text style={{ color: COLORS.textMuted, fontWeight: FW_MED }}>Raderar…</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handleDelete({ id: editingId })}
                    disabled={saving || !!deletingFsId}
                    style={{ paddingVertical: MODAL_DESIGN_2026.buttonPaddingVertical, paddingHorizontal: MODAL_DESIGN_2026.buttonPaddingHorizontal, borderRadius: MODAL_DESIGN_2026.buttonRadius, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', opacity: (saving || deletingFsId) ? 0.7 : 1 }}
                  >
                    <Text style={{ color: COLORS.danger, fontWeight: MODAL_DESIGN_2026.buttonPrimaryFontWeight }}>Ta bort</Text>
                  </Pressable>
                )
              ) : (
                <View />
              )}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={closePanel}
                  disabled={saving}
                  style={({ hovered }) => ({
                    paddingVertical: MODAL_DESIGN_2026.buttonPaddingVertical,
                    paddingHorizontal: MODAL_DESIGN_2026.buttonPaddingHorizontal,
                    borderRadius: MODAL_DESIGN_2026.buttonRadius,
                    borderWidth: 1,
                    borderColor: '#ddd',
                    backgroundColor: hovered ? '#f8f8f8' : MODAL_DESIGN_2026.buttonSecondaryBg,
                    opacity: saving ? 0.7 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  })}
                >
                  <Text style={{ color: MODAL_DESIGN_2026.buttonSecondaryColor, fontWeight: MODAL_DESIGN_2026.buttonPrimaryFontWeight }}>Stäng</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={({ hovered }) => ({
                    paddingVertical: MODAL_DESIGN_2026.buttonPaddingVertical,
                    paddingHorizontal: MODAL_DESIGN_2026.buttonPaddingHorizontal,
                    borderRadius: MODAL_DESIGN_2026.buttonRadius,
                    backgroundColor: hovered ? '#3A4A5D' : MODAL_DESIGN_2026.buttonPrimaryBg,
                    opacity: saving ? 0.7 : 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  })}
                >
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : null}
                  <Text style={{ color: MODAL_DESIGN_2026.buttonPrimaryColor, fontWeight: MODAL_DESIGN_2026.buttonPrimaryFontWeight }}>
                    {saving ? (editingId ? 'Sparar…' : 'Sparar fråga…') : (editingId ? 'Spara' : 'Skapa')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ansvariga-picker renderas nu inuti Ny fråga-modalen som overlay – då får bara en Modal ESC */}

      </View>
    </ErrorBoundary>
  );
}
