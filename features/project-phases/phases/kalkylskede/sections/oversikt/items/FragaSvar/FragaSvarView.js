/**
 * FragaSvarView
 * (Översikt 04) – Table view (step 1).
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
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

import DashboardBanner from '../../../../../../../../components/common/Dashboard/DashboardBanner';
import IsoDatePickerModal from '../../../../../../../../components/common/Modals/IsoDatePickerModal';
import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';
import ContextMenu from '../../../../../../../../components/ContextMenu';
import ErrorBoundary from '../../../../../../../../components/ErrorBoundary';
import { auth, formatSharePointProjectFolderName, logCompanyActivity, patchCompanyProject } from '../../../../../../../../components/firebase';
import { useProjectOrganisation } from '../../../../../../../../hooks/useProjectOrganisation';
import { ensureFolderPath, getDriveItemByPath, resolveProjectRootFolderPath as resolveProjectRootFolderPathInSite, uploadFile } from '../../../../../../../../services/azure/fileService';
import { getSiteByUrl } from '../../../../../../../../services/azure/siteService';
import { getSharePointFolderItems } from '../../../../../../../../services/sharepoint/sharePointStructureService';
import {
    createFragaSvarItem,
    deleteFragaSvarItem,
    listenFragaSvarItems,
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
  const firstName = safeText(list[0]?.name) || 'Vald';
  if (list.length === 1) return firstName;
  return `${firstName} +${list.length - 1}`;
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
    text: '#111',
    textMuted: '#475569',
    textSubtle: '#64748b',
    inputBorder: '#E2E8F0',
    tableBorder: '#EEF0F3',
    tableHeaderText: '#64748b',
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

  const [statusMenuVisible, setStatusMenuVisible] = useState(false);
  const [statusMenuPos, setStatusMenuPos] = useState({ x: 20, y: 64 });

  const [rowStatusMenuVisible, setRowStatusMenuVisible] = useState(false);
  const [rowStatusMenuPos, setRowStatusMenuPos] = useState({ x: 20, y: 64 });
  const [rowStatusTarget, setRowStatusTarget] = useState(null);

  const [panelVisible, setPanelVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedRowId, setSelectedRowId] = useState(null);

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

  // Ansvarig picker (searchable multi-select)
  const [responsiblePickerVisible, setResponsiblePickerVisible] = useState(false);
  const [responsiblePickerFor, setResponsiblePickerFor] = useState('quick'); // 'quick' | 'form'
  const [responsiblePickerSearch, setResponsiblePickerSearch] = useState('');

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
      if (sortColumn === 'title') return safeText(it?.title) || deriveTitleFromText(it?.question);
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
    setDisciplineMenuVisible(true);
  };

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
    const firstResolved = findResponsibleByKey(orgGroups, normalized[0]);
    const firstName = safeText(firstResolved?.member?.name) || 'Vald';
    if (normalized.length === 1) return firstName;
    return `${firstName} +${normalized.length - 1}`;
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
    const sortedGroups = [...groups]
      .filter(Boolean)
      .sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'sv'));

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
    const ok = await confirmWebOrNative('Är du säker att du vill radera raden?');
    if (!ok) return;
    const deletedId = String(it?.id || '').trim();
    try {
      const user = auth?.currentUser || null;
      await deleteFragaSvarItem(companyId, projectId, it?.id, {
        userId: user?.uid || null,
        displayName: safeText(user?.displayName) || safeText(user?.email) || null,
      });

      // Consider the row deleted only after the mutation (incl Excel write-through) succeeds.
      if (deletedId) {
        setOptimisticallyDeletedById((prev) => ({ ...(prev || {}), [deletedId]: true }));
      }

      if (deletedId && deletedId === String(selectedRowId || '').trim()) {
        setPanelVisible(false);
        setEditingId(null);
        setSelectedRowId(null);
      }
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte ta bort.'));
    }
  };

  const closePanel = () => {
    setPanelVisible(false);
    setEditingId(null);
    setSelectedRowId(null);
  };

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

    // Required structure: Projekt → 01 - Översikt → 04 - FrågaSvar
    const base = rootPath === '/'
      ? '/01 - Översikt/04 - FrågaSvar'
      : `${rootPath}/01 - Översikt/04 - FrågaSvar`;
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
    const out = [
      { type: 'top', key: 'top' },
      { type: 'tableHeader', key: 'tableHeader' },
    ];
    if (loading) out.push({ type: 'loading', key: 'loading' });
    if (!loading && filteredAndSorted.length === 0) out.push({ type: 'empty', key: 'empty' });
    for (const it of filteredAndSorted) {
      out.push({ type: 'row', key: `row:${safeText(it?.id) || Math.random()}`, it });
    }
    return out;
  }, [filteredAndSorted, loading]);

  const tableColStyles = {
    byggdel: { width: 110 },
    rubrik: { flex: 1, minWidth: 340 },
    discipline: { width: 130 },
    ansvarig: { width: 170 },
    svarSenast: { width: 130 },
    status: { width: 180 },
    action: { width: 120 },
  };

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

  const toggleExpandedRow = (it) => {
    const id = safeText(it?.id);
    if (!id) return;
    setSelectedRowId((prev) => {
      const next = safeText(prev) === id ? null : id;
      if (next) {
        try { refreshFilesForItem(it); } catch (_e) {}
      }
      return next;
    });
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
            Överblick först, detaljer vid behov. Klicka en rad för att öppna ärendet inline.
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

          {/* Ny fråga (collapsible) */}
          <View style={{
            paddingTop: 4,
            paddingBottom: 12,
            marginBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.tableBorder,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: FW_MED, color: COLORS.text }}>
                Ny fråga
              </Text>

              <Pressable
                onPress={() => setQuickPanelOpen((v) => !v)}
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
                  {quickPanelOpen ? 'Stäng ny fråga' : 'Ny fråga'}
                </Text>
              </Pressable>
            </View>

            {quickPanelOpen ? (
              <View style={{
                marginTop: 10,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 12,
                backgroundColor: '#F8FAFC',
                padding: 12,
              }}>
                <View
                  style={{
                    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
                    gap: 10,
                    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
                  }}
                >
              {/* Byggdel */}
              <View style={{ width: Platform.OS === 'web' ? 200 : '100%' }}>
                <View
                  style={{
                    height: 44,
                    borderWidth: 1,
                    borderColor: COLORS.inputBorder,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    backgroundColor: hasContext ? '#fff' : COLORS.bgMuted,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    opacity: (!hasContext || quickSaving) ? 0.8 : 1,
                  }}
                >
                  <Text style={{ color: COLORS.textSubtle, fontSize: 13, fontWeight: '400' }} numberOfLines={1}>
                    Byggdel
                  </Text>
                  <TextInput
                    value={quickBd}
                    onChangeText={setQuickBd}
                    placeholder="Byggdel"
                    placeholderTextColor={COLORS.textSubtle}
                    editable={hasContext && !quickSaving}
                    style={{
                      flex: 1,
                      height: 42,
                      paddingVertical: 0,
                      paddingHorizontal: 0,
                      fontSize: 14,
                      color: COLORS.text,
                      backgroundColor: 'transparent',
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                    }}
                  />
                </View>
              </View>

              {/* Disciplin */}
              <Pressable
                onPress={(e) => openDisciplineMenu(e, 'quick')}
                disabled={!hasContext || quickSaving}
                style={({ hovered, pressed }) => ({
                  width: Platform.OS === 'web' ? 180 : '100%',
                  height: 44,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.inputBorder,
                  backgroundColor: hasContext ? '#fff' : COLORS.bgMuted,
                  opacity: (!hasContext || quickSaving) ? 0.7 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                  ...(pressed ? { opacity: 0.9 } : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Text style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: '400', color: COLORS.textMuted }} numberOfLines={1}>
                  <Text style={{ color: COLORS.textSubtle }}>Disciplin </Text>
                  <Text style={{ color: COLORS.text }}>{normalizeDiscipline(quickDiscipline) || 'Intern'}</Text>
                </Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.textSubtle} />
              </Pressable>

              {/* Ansvarig (multi) */}
              <Pressable
                onPress={() => openResponsiblePicker('quick')}
                disabled={!hasContext || quickSaving || orgLoading}
                style={({ hovered, pressed }) => {
                  return {
                    width: Platform.OS === 'web' ? 360 : '100%',
                    paddingHorizontal: 12,
                    height: 44,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: COLORS.inputBorder,
                    backgroundColor: hasContext ? '#fff' : COLORS.bgMuted,
                    opacity: (!hasContext || quickSaving || orgLoading) ? 0.7 : 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                    ...(pressed ? { opacity: 0.9 } : {}),
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  };
                }}
              >
                <Text style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: '400', color: COLORS.textMuted }} numberOfLines={1}>
                  <Text style={{ color: COLORS.textSubtle }}>Ansvarig </Text>
                  {(() => {
                    const keys = normalizeResponsibleKeys(quickResponsibleKeys);
                    const label = orgLoading
                      ? 'Laddar…'
                      : (keys.length ? formatResponsibleSummary(keys) : 'Välj personer…');
                    const color = keys.length ? COLORS.text : COLORS.textMuted;
                    return <Text style={{ color }} numberOfLines={1}>{label}</Text>;
                  })()}
                </Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.textSubtle} />
              </Pressable>

              {/* Svar senast */}
              <Pressable
                onPress={() => openDatePicker('quick')}
                disabled={!hasContext || quickSaving}
                style={({ hovered, pressed }) => ({
                  width: Platform.OS === 'web' ? 220 : '100%',
                  height: 44,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.inputBorder,
                  backgroundColor: hasContext ? '#fff' : COLORS.bgMuted,
                  opacity: (!hasContext || quickSaving) ? 0.7 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                  ...(pressed ? { opacity: 0.9 } : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Text style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: '400', color: COLORS.textMuted }} numberOfLines={1}>
                  <Text style={{ color: COLORS.textSubtle }}>Svar senast </Text>
                  <Text style={{ color: COLORS.text }}>{normalizeDateYmd(quickNeedsAnswerBy) || '—'}</Text>
                </Text>
                <Ionicons name="calendar-outline" size={16} color={COLORS.textSubtle} />
              </Pressable>

              {/* Create */}
              <Pressable
                onPress={createQuick}
                disabled={!hasContext || quickSaving || quickUploadingFiles || !safeText(quickTitle) || !safeText(quickQuestion)}
                style={({ hovered, pressed }) => ({
                  height: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.inputBorder,
                  backgroundColor: '#fff',
                  opacity: (!hasContext || quickSaving || quickUploadingFiles || !safeText(quickTitle) || !safeText(quickQuestion)) ? 0.4 : 1,
                  ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                  ...(pressed ? { opacity: 0.9 } : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                {quickSaving ? <ActivityIndicator size="small" color={COLORS.textMuted} /> : <Ionicons name="add" size={16} color={COLORS.textMuted} />}
                <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: FW_MED }}>
                  {quickSaving ? 'Sparar fråga…' : 'Skapa'}
                </Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 10 }}>
              <TextInput
                value={quickTitle}
                onChangeText={setQuickTitle}
                placeholder={hasContext ? 'Rubrik' : 'Saknar projektkontext'}
                placeholderTextColor={COLORS.textSubtle}
                editable={hasContext && !quickSaving && !quickUploadingFiles}
                style={{
                  borderWidth: 1,
                  borderColor: (quickAttemptedSubmit && !safeText(quickTitle)) ? '#FCA5A5' : COLORS.inputBorder,
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  fontSize: 14,
                  color: COLORS.text,
                  backgroundColor: hasContext ? '#fff' : COLORS.bgMuted,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                }}
              />
            </View>

            {(quickAttemptedSubmit && !safeText(quickTitle)) ? (
              <Text style={{ marginTop: 6, fontSize: 12, color: '#991B1B' }}>Rubrik är obligatorisk.</Text>
            ) : null}

            <View style={{ marginTop: 10 }}>
              <TextInput
                ref={quickQuestionRef}
                value={quickQuestion}
                onChangeText={setQuickQuestion}
                placeholder={hasContext ? 'Fråga / Beskrivning… (Enter för att skapa)' : 'Saknar projektkontext'}
                placeholderTextColor={COLORS.textSubtle}
                editable={hasContext && !quickSaving && !quickUploadingFiles}
                multiline
                scrollEnabled={false}
                blurOnSubmit={false}
                onKeyPress={(e) => {
                  if (Platform.OS !== 'web') return;
                  const key = String(e?.nativeEvent?.key || '');
                  const shiftKey = !!e?.nativeEvent?.shiftKey;
                  if (key === 'Enter' && !shiftKey) {
                    try { e?.preventDefault?.(); } catch (_err) {}
                    createQuick();
                  }
                }}
                onContentSizeChange={(e) => {
                  const raw = Number(e?.nativeEvent?.contentSize?.height || 0);
                  if (!Number.isFinite(raw) || raw <= 0) return;
                  const pad = Platform.OS === 'web' ? 0 : 18;
                  const next = Math.max(74, Math.ceil(raw + pad));
                  setQuickQuestionHeight((prev) => (Math.abs(Number(prev) - next) >= 2 ? next : prev));
                }}
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.inputBorder,
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  fontSize: 14,
                  color: COLORS.text,
                  backgroundColor: hasContext ? '#fff' : COLORS.bgMuted,
                  minHeight: 74,
                  height: quickQuestionHeight,
                }}
              />
            </View>

            <View
              style={{
                marginTop: 10,
                borderWidth: 1,
                borderColor: quickDrag ? COLORS.blue : COLORS.tableBorder,
                backgroundColor: quickDrag ? 'rgba(25,118,210,0.04)' : 'transparent',
                padding: 10,
                borderRadius: 12,
                overflow: 'hidden',
              }}
              onDragOver={(e) => {
                if (Platform.OS !== 'web') return;
                try { e?.preventDefault?.(); } catch (_e) {}
                setQuickDrag(true);
              }}
              onDragLeave={() => {
                if (Platform.OS !== 'web') return;
                setQuickDrag(false);
              }}
              onDrop={(e) => {
                if (Platform.OS !== 'web') return;
                try { e?.preventDefault?.(); } catch (_e) {}
                setQuickDrag(false);
                try {
                  const list = Array.from(e?.dataTransfer?.files || []);
                  addQuickFiles(list);
                } catch (_err) {}
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: COLORS.textSubtle, fontWeight: FW_MED }}>Bifogade filer</Text>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      Alert.alert('Lägg till filer', 'Filbifogning är tillgängligt i webbläget.');
                      return;
                    }

                    setQuickUploadError('');
                    // IMPORTANT (web): the file picker must be opened synchronously from the user gesture.
                    // We therefore start SharePoint preflight in the background and only block the upload later.
                    try {
                      quickEnsureRef.current = { promise: resolveFragaSvarRootPath() };
                      quickEnsureRef.current.promise.catch((e) => {
                        reportSharePointFailure('Kunde inte förbereda filbifogning i SharePoint', e);
                        setQuickUploadError('SharePoint-synk misslyckades. Bilagor är spärrade tills SharePoint fungerar.');
                      });
                    } catch (_e) {}

                    try { quickFileInputRef.current?.click?.(); } catch (_e) {}
                  }}
                  disabled={!hasContext || quickSaving || quickUploadingFiles}
                  style={({ hovered, pressed }) => ({
                    paddingVertical: 5,
                    paddingHorizontal: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: COLORS.tableBorder,
                    backgroundColor: '#fff',
                    opacity: (!hasContext || quickSaving || quickUploadingFiles) ? 0.5 : 1,
                    ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                    ...(pressed ? { opacity: 0.9 } : {}),
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  })}
                >
                  <Text style={{ color: COLORS.blue, fontWeight: FW_MED, fontSize: 12 }}>
                    {quickUploadingFiles ? 'Lägger till…' : '+ Lägg till filer'}
                  </Text>
                </Pressable>
              </View>

              {Platform.OS === 'web' ? (
                <input
                  ref={quickFileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const list = Array.from(e?.target?.files || []);
                    addQuickFiles(list);
                    try { if (quickFileInputRef?.current) quickFileInputRef.current.value = ''; } catch (_err) {}
                  }}
                />
              ) : null}

              {quickUploadError ? (
                <View style={{ padding: 10, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 10, marginBottom: 10, marginTop: 10 }}>
                  <Text style={{ color: '#991B1B', fontSize: 13 }}>{quickUploadError}</Text>
                </View>
              ) : null}

              {(Array.isArray(quickFiles) ? quickFiles : []).length > 0 ? (
                <View style={{ marginTop: 8, borderWidth: 1, borderColor: COLORS.tableBorder, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
                  <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: COLORS.bgMuted, borderBottomWidth: 1, borderBottomColor: COLORS.tableBorder }}>
                    <Text style={{ flex: 2, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Filnamn</Text>
                    <Text style={{ width: 70, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Filtyp</Text>
                    <Text style={{ flex: 1, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Uppladdad av</Text>
                    <Text style={{ width: 120, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED, textAlign: 'right' }} numberOfLines={1}>Datum</Text>
                    <View style={{ width: 30 }} />
                  </View>

                  {(Array.isArray(quickFiles) ? quickFiles : []).map((f, i) => {
                    const k = fileKey(f);
                    const name = safeText(f?.name) || 'fil';
                    const { label } = classifyFileType(name);
                    const by = safeText(auth?.currentUser?.displayName) || safeText(auth?.currentUser?.email) || '—';
                    const at = formatDateTime(new Date().toISOString()) || '—';
                    return (
                      <Pressable
                        key={k}
                        onPress={() => openPreviewForLocalFile(f)}
                        style={({ hovered, pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 7,
                          paddingHorizontal: 10,
                          borderBottomWidth: i === quickFiles.length - 1 ? 0 : 1,
                          borderBottomColor: COLORS.tableBorder,
                          backgroundColor: pressed ? 'rgba(25,118,210,0.06)' : (Platform.OS === 'web' && hovered ? 'rgba(25,118,210,0.04)' : '#fff'),
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        })}
                      >
                        <Text style={{ flex: 2, color: COLORS.blue, fontSize: 13 }} numberOfLines={1}>{name}</Text>
                        <Text style={{ width: 70, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>{label}</Text>
                        <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>{by}</Text>
                        <Text style={{ width: 120, color: COLORS.textMuted, fontSize: 12, textAlign: 'right' }} numberOfLines={1}>{at}</Text>
                        <Pressable
                          onPress={(e) => {
                            stopPressPropagation(e);
                            removeQuickFile(k);
                          }}
                          style={({ pressed: p2 }) => ({
                            width: 30,
                            alignItems: 'flex-end',
                            opacity: p2 ? 0.8 : 1,
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                          })}
                        >
                          <Ionicons name="close" size={16} color={COLORS.textSubtle} />
                        </Pressable>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
              </View>
            ) : null}
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
            gap: 6,
            paddingVertical: 10,
            paddingHorizontal: 10,
            backgroundColor: pressed ? 'rgba(15,23,42,0.04)' : (hovered ? 'rgba(15,23,42,0.02)' : '#fff'),
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            ...style,
          })}
        >
          <Text style={{ color: COLORS.tableHeaderText, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>{label}</Text>
          <Ionicons name={sortIcon(col)} size={14} color={COLORS.textSubtle} />
        </Pressable>
      );

      const HeaderTextCell = ({ label, style }) => (
        <View style={{ paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#fff', ...style }}>
          <Text style={{ color: COLORS.tableHeaderText, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>{label}</Text>
        </View>
      );

      return (
        <View style={{ backgroundColor: '#fff' }}>
          <View style={{ paddingHorizontal: 18 }}>
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.tableBorder, backgroundColor: '#fff', overflow: 'hidden', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
              <HeaderCell col="bd" label="Byggdel" style={tableColStyles.byggdel} />
              <HeaderCell col="title" label="Rubrik" style={tableColStyles.rubrik} />
              <HeaderCell col="discipline" label="Disciplin" style={tableColStyles.discipline} />
              <HeaderCell col="responsibles" label="Ansvarig" style={tableColStyles.ansvarig} />
              <HeaderCell col="needsAnswerBy" label="Svar senast" style={tableColStyles.svarSenast} />
              <HeaderCell col="status" label="Status" style={tableColStyles.status} />
              <HeaderTextCell label="Åtgärd" style={tableColStyles.action} />
            </View>
          </View>
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
      const answerText = safeText(it?.answer) || safeText(it?.comment);

      const answeredAt = formatDateTime(it?.answeredAt) || '';
      const answeredBy = answeredAt ? (safeText(it?.answeredByName) || 'Okänd användare') : '';

      const expanded = safeText(selectedRowId) === id;
      const isUploading = !!rowUploadingById?.[id];
      const rowErr = safeText(rowUploadErrorById?.[id]);

      const hasLiveKey = Object.prototype.hasOwnProperty.call(fsFolderFilesById || {}, id);
      const liveFiles = fsFolderFilesById?.[id];
      const attachmentsMeta = uniqAttachments(Array.isArray(it?.attachments) ? it.attachments : []);
      const liveForMerge = (hasLiveKey && Array.isArray(liveFiles))
        ? liveFiles.map((f) => ({
          name: f?.name,
          webUrl: f?.webUrl,
          downloadUrl: f?.downloadUrl,
          createdBy: f?.createdBy,
          lastModified: f?.lastModified,
        }))
        : null;

      const filesAll = liveForMerge
        ? mergeLiveFilesWithAttachments(liveForMerge, attachmentsMeta)
        : attachmentsMeta;

      const questionFiles = (Array.isArray(filesAll) ? filesAll : []).filter((f) => normalizeAttachedIn(f?.attachedIn) === 'question');
      const answerFiles = (Array.isArray(filesAll) ? filesAll : []).filter((f) => normalizeAttachedIn(f?.attachedIn) === 'answer');

      return (
        <View style={{ paddingHorizontal: 18 }}>
          <View style={{ borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: COLORS.tableBorder, overflow: 'hidden', borderBottomLeftRadius: isLastVisibleRow ? 12 : 0, borderBottomRightRadius: isLastVisibleRow ? 12 : 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
              <Pressable
                onPress={() => toggleExpandedRow(it)}
                style={({ hovered, pressed }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  backgroundColor: pressed ? 'rgba(25,118,210,0.04)' : tone.bg,
                  ...(Platform.OS === 'web' && hovered ? { filter: 'brightness(0.99)' } : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <View style={{ ...tableColStyles.byggdel, paddingVertical: 10, paddingHorizontal: 10 }}>
                  <Text style={{ color: COLORS.text, fontSize: 13 }} numberOfLines={1}>{bd}</Text>
                </View>

                <View style={{ ...tableColStyles.rubrik, paddingVertical: 10, paddingHorizontal: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ color: COLORS.text, fontSize: 13, flex: 1 }}>
                      {fsNumber ? `${fsNumber} – ` : ''}{title || '—'}
                    </Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSubtle} />
                  </View>
                </View>

                <View style={{ ...tableColStyles.discipline, paddingVertical: 10, paddingHorizontal: 10 }}>
                  <Text
                    style={{ color: COLORS.textMuted, fontSize: 13 }}
                    numberOfLines={1}
                    title={Platform.OS === 'web' ? discipline : undefined}
                  >
                    {discipline}
                  </Text>
                </View>

                <View style={{ ...tableColStyles.ansvarig, paddingVertical: 10, paddingHorizontal: 10 }}>
                  <Text
                    style={{ color: COLORS.textMuted, fontSize: 13 }}
                    numberOfLines={1}
                    title={Platform.OS === 'web' ? (responsiblesTooltip || ansvarigSummary) : undefined}
                  >
                    {ansvarigSummary}
                  </Text>
                </View>

                <View style={{ ...tableColStyles.svarSenast, paddingVertical: 10, paddingHorizontal: 10 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }} numberOfLines={1}>{needsBy}</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={(e) => openRowStatusMenu(e, it)}
                style={({ hovered, pressed }) => ({
                  ...tableColStyles.status,
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  backgroundColor: pressed ? 'rgba(25,118,210,0.04)' : tone.bg,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: 8,
                  ...(Platform.OS === 'web' && hovered ? { filter: 'brightness(0.99)' } : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: tone.statusBorder, backgroundColor: tone.statusBg, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                  {overdue ? <Ionicons name="alert-circle" size={14} color={tone.statusFg} /> : null}
                  <Text style={{ fontSize: 12, fontWeight: FW_MED, color: tone.statusFg }} numberOfLines={1}>
                    {displayStatusLabel(normalizedStatus)}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={tone.statusFg} />
                </View>
              </Pressable>

              <Pressable
                onPress={(e) => {
                  stopPressPropagation(e);
                  openAnswer(it);
                }}
                style={({ hovered, pressed }) => ({
                  ...tableColStyles.action,
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  backgroundColor: pressed ? 'rgba(25,118,210,0.04)' : tone.bg,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: '#fff' }}>
                  <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textMuted }} numberOfLines={1}>Svara</Text>
                </View>
              </Pressable>
            </View>

            {expanded ? (
              <View style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: 'rgba(15,23,42,0.08)', padding: 12 }}>
                {/* ExpandedCard (root) */}
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                    ...(Platform.OS === 'web' ? { boxShadow: '0 6px 18px rgba(0,0,0,0.06)' } : { elevation: 2 }),
                  }}
                >
                  {Platform.OS === 'web' ? (
                    <input
                      ref={rowFileInputRef}
                      type="file"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const list = Array.from(e?.target?.files || []);
                        const targetId = safeText(rowUploadTargetId);
                        const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === targetId);
                        if (current && list.length > 0) {
                          (async () => {
                            const ensured = (rowEnsureRef.current && safeText(rowEnsureRef.current.id) === safeText(targetId))
                              ? await rowEnsureRef.current.promise.catch(() => null)
                              : null;
                            await uploadFilesToItem(current, list, ensured, rowUploadTargetAttachedIn);
                          })();
                        }
                        try { if (rowFileInputRef?.current) rowFileInputRef.current.value = ''; } catch (_err) {}
                      }}
                    />
                  ) : null}

                  {/* QuestionSection */}
                  <View style={{ padding: 12, backgroundColor: '#F8FAFC' }}>
                    <Text style={{ fontSize: 13, color: COLORS.text, fontWeight: FW_MED, marginBottom: 10 }}>
                      {fsNumber ? `${fsNumber} – ` : ''}{title || '—'}
                    </Text>

                    <Text style={{ fontSize: 12, color: COLORS.textSubtle, marginBottom: 10 }} numberOfLines={2}>
                      Skapad: {safeText(it?.createdByName) || 'Okänd användare'}
                      {formatDateTime(it?.createdAt) ? ` · ${formatDateTime(it?.createdAt)}` : ''}
                      {formatDateTime(it?.updatedAt) ? `  |  Senast uppdaterad: ${formatDateTime(it?.updatedAt)}` : ''}
                    </Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                        <Text style={{ color: COLORS.textSubtle, fontWeight: FW_MED }}>Disciplin: </Text>
                        {discipline || '—'}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                        <Text style={{ color: COLORS.textSubtle, fontWeight: FW_MED }}>Ansvariga: </Text>
                        {responsiblesTooltip || '—'}
                      </Text>
                    </View>

                    <Text style={{ fontSize: 12, color: COLORS.textSubtle, fontWeight: FW_MED, marginBottom: 6 }}>Fråga / Beskrivning</Text>
                    <Text style={{ color: COLORS.text, fontSize: 13, lineHeight: 19 }}>{questionText || '—'}</Text>

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
                            setRowUploadTargetId(id);
                            setRowUploadTargetAttachedIn('question');
                            setRowUploadErrorById((prev) => ({ ...(prev || {}), [id]: '' }));

                            // IMPORTANT (web): the file picker must be opened synchronously from the user gesture.
                            // Start SharePoint ensure in background; we will await it after file selection.
                            try {
                              const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(id));
                              rowEnsureRef.current = {
                                id: safeText(id),
                                promise: current ? ensureFolderPathForItem(current) : resolveFragaSvarRootPath().then(() => null),
                              };
                              rowEnsureRef.current.promise.catch((e) => {
                                reportSharePointFailure('Kunde inte förbereda filuppladdning i SharePoint', e, { fsId: safeText(id) || null });
                                setRowUploadErrorById((prev) => ({ ...(prev || {}), [id]: 'SharePoint-synk misslyckades. Bilagor är spärrade tills SharePoint fungerar.' }));
                              });
                            } catch (_e) {}

                            try { rowFileInputRef.current?.click?.(); } catch (_e) {}
                          }}
                          disabled={isUploading || Platform.OS !== 'web'}
                          style={({ hovered, pressed }) => ({
                            paddingVertical: 5,
                            paddingHorizontal: 8,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: COLORS.tableBorder,
                            backgroundColor: '#fff',
                            opacity: isUploading ? 0.6 : 1,
                            ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                            ...(pressed ? { opacity: 0.9 } : {}),
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                          })}
                        >
                          <Text style={{ color: COLORS.blue, fontWeight: FW_MED, fontSize: 12 }}>{isUploading ? 'Lägger till…' : '+ Lägg till filer'}</Text>
                        </Pressable>
                      </View>

                      {rowErr ? (
                        <View style={{ padding: 10, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 10, marginBottom: 10 }}>
                          <Text style={{ color: '#991B1B', fontSize: 13 }}>{rowErr}</Text>
                        </View>
                      ) : null}

                      {questionFiles.length > 0 ? (
                        <View style={{ borderWidth: 1, borderColor: COLORS.tableBorder, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
                          <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: COLORS.bgMuted, borderBottomWidth: 1, borderBottomColor: COLORS.tableBorder }}>
                            <Text style={{ flex: 2, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Filnamn</Text>
                            <Text style={{ width: 70, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Filtyp</Text>
                            <Text style={{ flex: 1, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Uppladdad av</Text>
                            <Text style={{ width: 120, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED, textAlign: 'right' }} numberOfLines={1}>Datum</Text>
                            <Text style={{ width: 34, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED, textAlign: 'right' }} numberOfLines={1} />
                          </View>

                          {questionFiles.map((f, i) => {
                            const row = f?.downloadUrl || f?.createdBy
                              ? toTableRowFromLiveFile(f)
                              : toTableRowFromAttachment(f);

                            return (
                              <Pressable
                                key={fileTableRowKey(row, i)}
                                onPress={() => openPreview({ name: row.name, webUrl: row.webUrl, downloadUrl: row.downloadUrl })}
                                style={({ hovered, pressed }) => ({
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  paddingVertical: 7,
                                  paddingHorizontal: 10,
                                  borderBottomWidth: i === questionFiles.length - 1 ? 0 : 1,
                                  borderBottomColor: COLORS.tableBorder,
                                  backgroundColor: pressed ? 'rgba(25,118,210,0.06)' : (Platform.OS === 'web' && hovered ? 'rgba(25,118,210,0.04)' : '#fff'),
                                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                                })}
                              >
                                <Text style={{ flex: 2, color: COLORS.blue, fontSize: 13 }} numberOfLines={1}>{row.name}</Text>
                                <Text style={{ width: 70, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>{row.fileTypeLabel}</Text>
                                <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>{row.uploadedBy}</Text>
                                <Text style={{ width: 120, color: COLORS.textMuted, fontSize: 12, textAlign: 'right' }} numberOfLines={1}>{row.dateText}</Text>
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
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={{ color: COLORS.textSubtle, fontSize: 13 }}>Inga filer.</Text>
                      )}
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={{ height: 2, backgroundColor: COLORS.borderStrong, borderRadius: 1 }} />

                  {/* AnswerSection */}
                  <View style={{ padding: 12, backgroundColor: '#EFF6FF' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, color: COLORS.textSubtle, fontWeight: FW_MED }}>Svar</Text>
                      <Text style={{ fontSize: 12, color: COLORS.textSubtle }} numberOfLines={1}>
                        {answeredAt ? `${answeredBy} · ${answeredAt}` : '—'}
                      </Text>
                    </View>

                    {answerText ? (
                      <Text style={{ color: COLORS.text, fontSize: 13, lineHeight: 19 }}>{answerText}</Text>
                    ) : (
                      <Text style={{ color: COLORS.textSubtle, fontSize: 13, fontStyle: 'italic' }}>Inget svar ännu</Text>
                    )}

                    {(Array.isArray(it?.answers) ? it.answers : []).length > 1 ? (
                      <View style={{ marginTop: 10, padding: 10, borderWidth: 1, borderColor: COLORS.tableBorder, backgroundColor: COLORS.bgMuted, borderRadius: 10 }}>
                        <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: FW_MED, marginBottom: 6 }}>
                          Svarhistorik ({(Array.isArray(it?.answers) ? it.answers : []).length})
                        </Text>
                        {(Array.isArray(it?.answers) ? [...it.answers] : [])
                          .map((x) => {
                            const d = toDateSafe(x?.answeredAt);
                            return { ...x, _t: d ? d.getTime() : 0 };
                          })
                          .sort((a, b) => (b._t - a._t))
                          .slice(0, 3)
                          .map((x, i) => (
                            <View key={`${x?._t}-${i}`} style={{ marginBottom: i === 2 ? 0 : 8 }}>
                              <Text style={{ color: COLORS.textSubtle, fontSize: 12 }} numberOfLines={1}>
                                {safeText(x?.answeredByName) || 'Okänd användare'}{x?._t ? ` · ${formatDateTime(x?.answeredAt)}` : ''}
                              </Text>
                              <Text style={{ color: COLORS.text, fontSize: 13, marginTop: 2 }}>
                                {safeText(x?.text)}
                              </Text>
                            </View>
                          ))}
                      </View>
                    ) : null}

                    {/* Answer attachments */}
                    <View style={{ marginTop: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ fontSize: 12, color: COLORS.textSubtle, fontWeight: FW_MED }}>Bilagor (Svar)</Text>
                        <Pressable
                          onPress={() => {
                            if (Platform.OS !== 'web') {
                              Alert.alert('Lägg till filer', 'Filbifogning är tillgängligt i webbläget.');
                              return;
                            }
                            setRowUploadTargetId(id);
                            setRowUploadTargetAttachedIn('answer');
                            setRowUploadErrorById((prev) => ({ ...(prev || {}), [id]: '' }));

                            // IMPORTANT (web): the file picker must be opened synchronously from the user gesture.
                            // Start SharePoint ensure in background; we will await it after file selection.
                            try {
                              const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(id));
                              rowEnsureRef.current = {
                                id: safeText(id),
                                promise: current ? ensureFolderPathForItem(current) : resolveFragaSvarRootPath().then(() => null),
                              };
                              rowEnsureRef.current.promise.catch((e) => {
                                reportSharePointFailure('Kunde inte förbereda filuppladdning i SharePoint', e, { fsId: safeText(id) || null });
                                setRowUploadErrorById((prev) => ({ ...(prev || {}), [id]: 'SharePoint-synk misslyckades. Bilagor är spärrade tills SharePoint fungerar.' }));
                              });
                            } catch (_e) {}

                            try { rowFileInputRef.current?.click?.(); } catch (_e) {}
                          }}
                          disabled={isUploading || Platform.OS !== 'web'}
                          style={({ hovered, pressed }) => ({
                            paddingVertical: 5,
                            paddingHorizontal: 8,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: COLORS.tableBorder,
                            backgroundColor: '#fff',
                            opacity: isUploading ? 0.6 : 1,
                            ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                            ...(pressed ? { opacity: 0.9 } : {}),
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                          })}
                        >
                          <Text style={{ color: COLORS.blue, fontWeight: FW_MED, fontSize: 12 }}>{isUploading ? 'Lägger till…' : '+ Lägg till filer'}</Text>
                        </Pressable>
                      </View>

                      {answerFiles.length > 0 ? (
                        <View style={{ borderWidth: 1, borderColor: COLORS.tableBorder, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
                          <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: COLORS.bgMuted, borderBottomWidth: 1, borderBottomColor: COLORS.tableBorder }}>
                            <Text style={{ flex: 2, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Filnamn</Text>
                            <Text style={{ width: 70, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Filtyp</Text>
                            <Text style={{ flex: 1, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED }} numberOfLines={1}>Uppladdad av</Text>
                            <Text style={{ width: 120, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED, textAlign: 'right' }} numberOfLines={1}>Datum</Text>
                            <Text style={{ width: 34, color: COLORS.textSubtle, fontSize: 12, fontWeight: FW_MED, textAlign: 'right' }} numberOfLines={1} />
                          </View>

                          {answerFiles.map((f, i) => {
                            const row = f?.downloadUrl || f?.createdBy
                              ? toTableRowFromLiveFile(f)
                              : toTableRowFromAttachment(f);

                            return (
                              <Pressable
                                key={fileTableRowKey(row, i)}
                                onPress={() => openPreview({ name: row.name, webUrl: row.webUrl, downloadUrl: row.downloadUrl })}
                                style={({ hovered, pressed }) => ({
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  paddingVertical: 7,
                                  paddingHorizontal: 10,
                                  borderBottomWidth: i === answerFiles.length - 1 ? 0 : 1,
                                  borderBottomColor: COLORS.tableBorder,
                                  backgroundColor: pressed ? 'rgba(25,118,210,0.06)' : (Platform.OS === 'web' && hovered ? 'rgba(25,118,210,0.04)' : '#fff'),
                                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                                })}
                              >
                                <Text style={{ flex: 2, color: COLORS.blue, fontSize: 13 }} numberOfLines={1}>{row.name}</Text>
                                <Text style={{ width: 70, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>{row.fileTypeLabel}</Text>
                                <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>{row.uploadedBy}</Text>
                                <Text style={{ width: 120, color: COLORS.textMuted, fontSize: 12, textAlign: 'right' }} numberOfLines={1}>{row.dateText}</Text>
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
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={{ color: COLORS.textSubtle, fontSize: 13 }}>Inga filer.</Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
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
      />

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

      {/* Ansvarig picker (multi-select + search) */}
      <Modal
        visible={responsiblePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResponsiblePickerVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)', padding: 18, justifyContent: 'center' }}>
          <Pressable onPress={() => setResponsiblePickerVisible(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

          <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.20)', maxHeight: '78vh' } : { maxHeight: '90%' }) }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(25,118,210,0.12)', borderWidth: 1, borderColor: 'rgba(25,118,210,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="people-outline" size={16} color={COLORS.blue} />
                </View>
                <View style={{ minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: FW_MED, color: COLORS.text }} numberOfLines={1}>Ansvariga</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textSubtle }} numberOfLines={1}>Välj en eller flera personer</Text>
                </View>
              </View>
              <Pressable
                onPress={() => setResponsiblePickerVisible(false)}
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
                <Ionicons name="close" size={18} color={COLORS.textSubtle} />
              </Pressable>
            </View>

            <View style={{ padding: 14, gap: 10 }}>
              <View style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="search" size={16} color={COLORS.textSubtle} />
                <TextInput
                  value={responsiblePickerSearch}
                  onChangeText={setResponsiblePickerSearch}
                  placeholder="Sök namn, e-post eller roll…"
                  placeholderTextColor={COLORS.textSubtle}
                  style={{ flex: 1, fontSize: 14, color: COLORS.text, ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
                />
              </View>

              {(() => {
                const which = responsiblePickerFor === 'form' ? 'form' : 'quick';
                const keys = normalizeResponsibleKeys(which === 'form' ? formResponsibleKeys : quickResponsibleKeys);
                if (keys.length === 0) return null;
                return (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {keys.map((k) => {
                      const resolved = findResponsibleByKey(orgGroups, k);
                      const name = safeText(resolved?.member?.name) || '—';
                      return (
                        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: 'rgba(25,118,210,0.06)' }}>
                          <Text style={{ fontSize: 12, color: COLORS.text }} numberOfLines={1}>{name}</Text>
                          <Pressable
                            onPress={() => removeResponsibleKeyFor(which, k)}
                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) })}
                          >
                            <Ionicons name="close" size={14} color={COLORS.textSubtle} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}
            </View>

            <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 0 }}>
              {orgError ? (
                <View style={{ padding: 10, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', borderRadius: 10, marginBottom: 12 }}>
                  <Text style={{ color: '#991B1B', fontSize: 13 }}>{String(orgError || 'Kunde inte ladda organisationen.')}</Text>
                </View>
              ) : null}

              {filteredResponsibleGroups.length === 0 ? (
                <View style={{ paddingVertical: 12 }}>
                  <Text style={{ color: COLORS.textMuted }}>Inga träffar.</Text>
                </View>
              ) : null}

              {filteredResponsibleGroups.map((g) => {
                const gid = safeText(g?.id);
                const gtitle = safeText(g?.title) || 'Grupp';
                const members = Array.isArray(g?.members) ? g.members : [];
                return (
                  <View key={gid || gtitle} style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle, marginBottom: 6 }}>{gtitle}</Text>
                    <View style={{ borderWidth: 1, borderColor: COLORS.tableBorder, borderRadius: 12, overflow: 'hidden' }}>
                      {members.map((m, idx) => {
                        const mid = safeText(m?.id);
                        const k = responsibleKey(gid, mid);
                        const which = responsiblePickerFor === 'form' ? 'form' : 'quick';
                        const selected = normalizeResponsibleKeys(which === 'form' ? formResponsibleKeys : quickResponsibleKeys).includes(k);
                        const name = safeText(m?.name) || '—';
                        const subtitle = safeText(m?.role) || safeText(m?.email) || '';
                        return (
                          <Pressable
                            key={k || `${gid}:${idx}`}
                            onPress={() => toggleResponsibleKeyFor(which, k)}
                            style={({ hovered, pressed }) => ({
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              backgroundColor: pressed ? 'rgba(25,118,210,0.06)' : (Platform.OS === 'web' && hovered ? 'rgba(25,118,210,0.04)' : '#fff'),
                              borderBottomWidth: idx === members.length - 1 ? 0 : 1,
                              borderBottomColor: COLORS.tableBorder,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                            })}
                          >
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ fontSize: 13, color: COLORS.text }} numberOfLines={1}>{name}</Text>
                              {subtitle ? <Text style={{ marginTop: 2, fontSize: 12, color: COLORS.textMuted }} numberOfLines={1}>{subtitle}</Text> : null}
                            </View>
                            <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color={selected ? COLORS.blue : COLORS.textSubtle} />
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <View style={{ marginTop: 6 }}>
                <Pressable
                  onPress={() => {
                    setResponsiblePickerVisible(false);
                    setExternalPersonTarget(responsiblePickerFor === 'form' ? 'form' : 'quick');
                    setExternalPersonError('');
                    setExternalPersonName('');
                    setExternalPersonEmail('');
                    setExternalPersonRole('');
                    setExternalPersonCreatingGroup(false);
                    setExternalPersonNewGroupTitle('');
                    {
                      const groups = Array.isArray(orgGroups) ? orgGroups : [];
                      const intern = groups.find((g) => String(g?.title || '').trim().toLowerCase() === 'intern') || null;
                      setExternalPersonGroupId(safeText(intern?.id) || safeText(groups?.[0]?.id) || '');
                    }
                    setExternalPersonModalVisible(true);
                  }}
                  style={({ hovered, pressed }) => ({
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: COLORS.inputBorder,
                    backgroundColor: pressed ? 'rgba(25,118,210,0.06)' : '#fff',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  })}
                >
                  <Ionicons name="person-add-outline" size={18} color={COLORS.blue} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: COLORS.text, fontWeight: FW_MED }} numberOfLines={1}>Lägg till person utanför projektet…</Text>
                    <Text style={{ marginTop: 2, color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>Läggs till i organisationen och kan väljas framöver</Text>
                  </View>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
        stickyHeaderIndices={[1]}
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

      {/* Edit/Create modal (wide + centered, matching create form) */}
      <Modal visible={panelVisible} transparent animationType="fade" onRequestClose={closePanel}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)', padding: 18, justifyContent: 'center' }}>
          <Pressable onPress={closePanel} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

          <View
            style={{
              width: '100%',
              maxWidth: 980,
              alignSelf: 'center',
              backgroundColor: '#fff',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: COLORS.border,
              overflow: 'hidden',
              ...(Platform.OS === 'web'
                ? { boxShadow: '0 12px 32px rgba(0,0,0,0.20)', maxHeight: '78vh' }
                : { maxHeight: '90%' }),
            }}
          >
            {/* Header (dashboard-style banner) */}
            <DashboardBanner
              marginBottom={0}
              borderRadius={0}
              borderLeftWidth={4}
              accentColor="#1976D2"
              backgroundColor="rgba(25, 118, 210, 0.12)"
              padding={14}
              title={editingId ? 'Fråga / Svar' : 'Ny fråga'}
              message={(() => {
                if (!editingId) return '';
                const current = (Array.isArray(items) ? items : []).find((x) => safeText(x?.id) === safeText(editingId));
                if (!current) return '';
                const createdBy = safeText(current?.createdByName) || 'Okänd användare';
                const createdAt = formatDateTime(current?.createdAt);
                const updatedAt = formatDateTime(current?.updatedAt);
                const createdPart = `Skapad: ${createdBy}${createdAt ? ` · ${createdAt}` : ''}`;
                const updatedPart = updatedAt ? `Senast uppdaterad: ${updatedAt}` : '';
                return updatedPart ? `${createdPart}  |  ${updatedPart}` : createdPart;
              })()}
              titleStyle={{ fontSize: 16, fontWeight: FW_MED, color: '#0F172A' }}
              messageStyle={{ marginTop: 4, fontSize: 12, color: 'rgba(51, 65, 85, 0.90)' }}
              onClose={closePanel}
            />

            {/* Content */}
            <ScrollView contentContainerStyle={{ padding: 14, backgroundColor: '#fff' }}>
              {/* FRÅGA */}
              <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                {/* Meta row: BD / Disciplin / Ansvarig / Svar senast */}
                <View
                  style={{
                    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
                    gap: 10,
                    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
                    marginBottom: 12,
                  }}
                >
                <View style={{ width: Platform.OS === 'web' ? 160 : '100%' }}>
                  <View
                    style={{
                      height: 44,
                      borderWidth: 1,
                      borderColor: COLORS.inputBorder,
                        borderRadius: 10,
                      paddingHorizontal: 12,
                      backgroundColor: '#fff',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: COLORS.textSubtle, fontSize: 13, fontWeight: '400' }} numberOfLines={1}>
                      Byggdel
                    </Text>
                    <TextInput
                      value={formBd}
                      onChangeText={setFormBd}
                      placeholder="t.ex. 55"
                      placeholderTextColor={COLORS.textSubtle}
                      style={{
                        flex: 1,
                        height: 42,
                        paddingVertical: 0,
                        paddingHorizontal: 0,
                        fontSize: 14,
                        color: COLORS.text,
                        backgroundColor: 'transparent',
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                      }}
                    />
                  </View>
                </View>

                <Pressable
                  onPress={(e) => openDisciplineMenu(e, 'form')}
                  style={({ hovered, pressed }) => ({
                    width: Platform.OS === 'web' ? 200 : '100%',
                    height: 44,
                    paddingHorizontal: 12,
                    borderRadius: 10,
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
                  <Text style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: '400', color: COLORS.textMuted }} numberOfLines={1}>
                    <Text style={{ color: COLORS.textSubtle }}>Disciplin </Text>
                    <Text style={{ color: COLORS.text }}>{normalizeDiscipline(formDiscipline) || 'Intern'}</Text>
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={COLORS.textSubtle} />
                </Pressable>

                <Pressable
                  onPress={() => openResponsiblePicker('form')}
                  disabled={orgLoading}
                  style={({ hovered, pressed }) => ({
                    width: Platform.OS === 'web' ? 360 : '100%',
                    paddingHorizontal: 12,
                    height: 44,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: COLORS.inputBorder,
                    backgroundColor: '#fff',
                    opacity: orgLoading ? 0.75 : 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    ...(Platform.OS === 'web' && hovered ? { borderColor: COLORS.blue } : {}),
                    ...(pressed ? { opacity: 0.92 } : {}),
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  })}
                >
                  <Text style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: '400', color: COLORS.textMuted }} numberOfLines={1}>
                    <Text style={{ color: COLORS.textSubtle }}>Ansvarig </Text>
                    {(() => {
                      const keys = normalizeResponsibleKeys(formResponsibleKeys);
                      const label = orgLoading
                        ? 'Laddar…'
                        : (keys.length ? formatResponsibleSummary(keys) : 'Välj personer…');
                      const color = keys.length ? COLORS.text : COLORS.textMuted;
                      return <Text style={{ color }} numberOfLines={1}>{label}</Text>;
                    })()}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={COLORS.textSubtle} />
                </Pressable>

                <Pressable
                  onPress={() => openDatePicker('form')}
                  style={({ hovered, pressed }) => ({
                    width: Platform.OS === 'web' ? 260 : '100%',
                    height: 44,
                    paddingHorizontal: 12,
                    borderRadius: 10,
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
                  <Text style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: '400', color: COLORS.textMuted }} numberOfLines={1}>
                    <Text style={{ color: COLORS.textSubtle }}>Svar senast </Text>
                    <Text style={{ color: COLORS.text }}>{normalizeDateYmd(formNeedsAnswerBy) || '—'}</Text>
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color={COLORS.textSubtle} />
                </Pressable>
              </View>

                <Text style={{ fontSize: 12, color: COLORS.textSubtle, fontWeight: '500', marginBottom: 6 }}>Rubrik</Text>
                <TextInput
                  value={formTitle}
                  onChangeText={setFormTitle}
                  placeholder="Rubrik (t.ex. 'Brandklass dörrar')"
                  placeholderTextColor={COLORS.textSubtle}
                  style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, backgroundColor: '#fff', padding: 10, minHeight: 44, color: COLORS.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }}
                />

                <Text style={{ fontSize: 12, color: COLORS.textSubtle, fontWeight: '500', marginBottom: 6, marginTop: 12 }}>Fråga / Beskrivning *</Text>
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
                    const next = Math.max(72, Math.ceil(raw + pad));
                    setQuestionInputHeight((prev) => (Math.abs(Number(prev) - next) >= 2 ? next : prev));
                  }}
                  style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, backgroundColor: '#fff', padding: 10, minHeight: 72, height: questionInputHeight, color: COLORS.text }}
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
              <View style={{ marginVertical: 14, height: 2, backgroundColor: COLORS.borderStrong, borderRadius: 1 }} />

              {/* SVAR */}
              <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textSubtle, fontWeight: '500' }}>Svar</Text>
                  {(() => {
                    const byRaw = safeText(items.find((x) => String(x?.id || '').trim() === String(editingId || '').trim())?.answeredByName);
                    const at = formatDateTime(items.find((x) => String(x?.id || '').trim() === String(editingId || '').trim())?.answeredAt);
                    const by = at ? (byRaw || 'Okänd användare') : '';
                    if (!by && !at) return null;
                    return (
                      <Text style={{ fontSize: 12, color: COLORS.textSubtle }} numberOfLines={1}>
                        {by}{at ? ` · ${at}` : ''}
                      </Text>
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
                    const next = Math.max(110, Math.ceil(raw + pad));
                    setAnswerInputHeight((prev) => (Math.abs(Number(prev) - next) >= 2 ? next : prev));
                  }}
                  style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 10, backgroundColor: '#fff', padding: 10, minHeight: 110, height: answerInputHeight, color: COLORS.text }}
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
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textSubtle, fontWeight: '500', marginBottom: 6 }}>Status</Text>
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

            {/* Footer */}
            <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {editingId ? (
                <Pressable
                  onPress={() => handleDelete({ id: editingId })}
                  disabled={saving}
                  style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', opacity: saving ? 0.7 : 1 }}
                >
                  <Text style={{ color: COLORS.danger, fontWeight: FW_MED }}>Ta bort</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={closePanel}
                  disabled={saving}
                  style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.inputBorder, backgroundColor: '#fff', opacity: saving ? 0.7 : 1 }}
                >
                  <Text style={{ color: COLORS.textMuted, fontWeight: FW_MED }}>Stäng</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={{ ...PRIMARY_ACTION_BUTTON_BASE, opacity: saving ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : null}
                  <Text style={{ color: '#fff', fontWeight: FW_MED }}>
                    {saving ? (editingId ? 'Sparar…' : 'Sparar fråga…') : (editingId ? 'Spara' : 'Skapa')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      </View>
    </ErrorBoundary>
  );
}
