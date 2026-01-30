/**
 * Deterministic, mutation-driven Excel sync for Fråga/Svar.
 *
 * Single source of truth: this module always rebuilds FS-logg.xlsx from current fsList
 * and overwrites the same SharePoint path.
 */

import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx-js-style';

import {
    auth,
    db,
    formatSharePointProjectFolderName,
    patchCompanyProject,
} from '../../../../../components/firebase';

import {
    ensureFolderPath,
    getDriveItemByPath,
    renameDriveItemByIdGuarded,
    resolveProjectRootFolderPath as resolveProjectRootFolderPathInSite,
    uploadFile,
} from '../../../../../services/azure/fileService';

import { getSiteByUrl } from '../../../../../services/azure/siteService';

const FS_LOG_FILENAME = 'FS-logg.xlsx';
const FS_LOG_SHEET_NAME = 'FS-logg';
const FS_LOG_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Leave some space above the register for future branding/project info.
const FS_LOG_TABLE_START_ROW = 6; // 1-based (header row)
const FS_LOG_TABLE_ORIGIN = `A${FS_LOG_TABLE_START_ROW}`;

const FS_LOG_LOCK_TTL_MS = 2 * 60 * 1000;

const EXCEL_LINK_BLUE = '0563C1';

const STATUSES = ['Obesvarad', 'Pågår', 'Klar', 'Ej aktuell'];

const cacheByProjectKey = new Map();

function safeText(s) {
  return String(s || '').trim();
}

function normalizeGraphPath(path) {
  const s = String(path || '').trim();
  if (!s) return '/';
  const trimmed = s.replace(/^\/+/, '').replace(/\/+$/, '');
  return `/${trimmed}`;
}

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

function sanitizeSharePointFolderName(name, maxLen = 100) {
  const raw = String(name || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.]+$/g, '');
  if (!cleaned) return '';
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen).trim().replace(/[\s.]+$/g, '');
}

function sanitizeExcelSheetName(name) {
  const raw = String(name || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  // Excel invalid chars: : \ / ? * [ ]
  const cleaned = raw
    .replace(/[:\\/?*\[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 31);
}

function makeUniqueExcelSheetName(preferred, used) {
  const base = sanitizeExcelSheetName(preferred) || 'Sheet';
  let name = base;
  let i = 2;
  while (used.has(name)) {
    const suffix = ` (${i})`;
    name = sanitizeExcelSheetName(`${base.slice(0, Math.max(0, 31 - suffix.length))}${suffix}`);
    i += 1;
  }
  used.add(name);
  return name;
}

function escapeExcelSheetForLink(name) {
  // Excel requires single quotes to be doubled inside sheet references.
  return String(name || '').replace(/'/g, "''");
}

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') {
    try { return value.toDate(); } catch (_e) { return null; }
  }
  if (typeof value?.toMillis === 'function') {
    try { return new Date(value.toMillis()); } catch (_e) { return null; }
  }
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d : null;
}

function pad2(n) {
  const i = Number(n || 0) || 0;
  return String(i).padStart(2, '0');
}

function toYmd(value) {
  const d = toDateSafe(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function normalizeDateYmd(value) {
  const s = safeText(value);
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return toYmd(value) || '';
}

function deriveTitleFromText(value, maxLen = 80) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

function formatFsNumberFromItem(it) {
  const raw = safeText(it?.fsNumber);
  if (raw) return raw;
  const seq = Number(it?.fsSeq || 0) || 0;
  if (seq > 0) return `FS${String(seq).padStart(2, '0')}`;
  return '';
}

function normalizeStatusValue(value) {
  const s = safeText(value);
  if (!s) return 'Obesvarad';
  const lower = s.toLowerCase();
  if (lower === 'klar') return 'Klar';
  if (lower === 'pågår' || lower === 'pagar' || lower === 'pgr') return 'Pågår';
  if (lower === 'ej aktuell' || lower === 'ejaktuella' || lower === 'ej_aktuell') return 'Ej aktuell';
  return 'Obesvarad';
}

function normalizeBd(value) {
  return safeText(value);
}

function displayDiscipline(it) {
  return safeText(it?.discipline || it?.stalledTill || '');
}

function normalizeResponsiblesFromItem(it) {
  const arr = Array.isArray(it?.responsibles) ? it.responsibles : [];
  if (arr.length > 0) return arr;
  const single = it?.responsible && typeof it.responsible === 'object' ? [it.responsible] : [];
  return single;
}

function projectKey(companyId, projectId) {
  return `${safeText(companyId)}::${safeText(projectId)}`;
}

async function getProjectData(companyId, projectId) {
  const ref = doc(db, 'foretag', safeText(companyId), 'projects', safeText(projectId));
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() || {}) : {};
}

async function resolveProjectSiteId(companyId, projectId, project) {
  const existing = safeText(project?.sharePointSiteId);
  if (existing) return existing;

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
          try {
            await patchCompanyProject(companyId, projectId, {
              sharePointSiteId: String(site.siteId),
              sharePointSiteUrl: String(site.webUrl || siteUrl),
            });
          } catch (_e) {}
          return String(site.siteId);
        }
      }
    } catch (_e) {
      // fallthrough
    }
  }

  throw new Error('Projektets SharePoint-site saknas eller är felkonfigurerad.');
}

async function resolveProjectRootFolderPath(companyId, projectId, siteId, project) {
  const existing = safeText(project?.sharePointRootPath || project?.rootFolderPath);
  if (existing) {
    try {
      const item = await getDriveItemByPath(existing, siteId);
      if (item?.folder) {
        return String(existing || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
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

  try {
    await patchCompanyProject(companyId, projectId, {
      rootFolderPath: String(derived),
      sharePointRootPath: String(derived),
    });
  } catch (_e) {}

  return String(derived);
}

async function resolveFragaSvarRootPath(companyId, projectId, siteId, rootFolderPath) {
  const rootPath = normalizeGraphPath(rootFolderPath);
  const base = rootPath === '/'
    ? '/01 - Översikt/04 - FrågaSvar'
    : `${rootPath}/01 - Översikt/04 - FrågaSvar`;
  const normalized = normalizeGraphPath(base);
  const withoutLeadingSlash = normalized.replace(/^\/+/, '');
  await ensureFolderPath(withoutLeadingSlash, safeText(companyId), siteId, { siteRole: 'projects', strict: true });
  return withoutLeadingSlash;
}

async function ensureFsLogFile({ companyId, projectId, siteId, rootFsPath }) {
  const canonicalPath = `${safeText(rootFsPath)}/${FS_LOG_FILENAME}`;

  // Fast path: canonical exists in SharePoint.
  try {
    const item = await getDriveItemByPath(canonicalPath, siteId);
    if (item) {
      try {
        await patchCompanyProject(companyId, projectId, {
          fragaSvarLog: {
            path: canonicalPath,
            fileName: FS_LOG_FILENAME,
            siteId,
            state: 'ready',
            driveItemId: safeText(item?.id) || null,
            webUrl: safeText(item?.webUrl) || null,
            readyAt: serverTimestamp(),
          },
        });
      } catch (_e) {}
      return { path: canonicalPath };
    }
  } catch (_e) {
    // not found
  }

  const projectRef = doc(db, 'foretag', safeText(companyId), 'projects', safeText(projectId));
  const user = auth?.currentUser || null;

  const txResult = await runTransaction(db, async (tx) => {
    const snap = await tx.get(projectRef);
    const data = snap.exists() ? (snap.data() || {}) : {};
    const log = data?.fragaSvarLog || null;

    // If some older path is stored, try to migrate it to canonical.
    const storedPath = safeText(log?.path);
    if (storedPath) {
      return { status: 'stored', storedPath };
    }

    const state = safeText(log?.state);
    const creatingAtMs = typeof log?.creatingAt?.toMillis === 'function' ? log.creatingAt.toMillis() : 0;
    const now = Date.now();
    const creatingFresh = state === 'creating' && creatingAtMs && (now - creatingAtMs) < FS_LOG_LOCK_TTL_MS;
    if (creatingFresh) return { status: 'in_progress', path: canonicalPath };

    tx.set(projectRef, {
      fragaSvarLog: {
        path: canonicalPath,
        fileName: FS_LOG_FILENAME,
        siteId,
        state: 'creating',
        creatingAt: serverTimestamp(),
        creatingByUid: user?.uid || null,
        creatingByName: safeText(user?.displayName) || safeText(user?.email) || null,
      },
    }, { merge: true });

    return { status: 'locked', path: canonicalPath };
  });

  // If we had a storedPath, try to rename it into canonical path.
  if (txResult?.status === 'stored' && txResult?.storedPath) {
    const storedPath = safeText(txResult.storedPath);
    if (storedPath && storedPath !== canonicalPath) {
      try {
        const item = await getDriveItemByPath(storedPath, siteId);
        const legacyId = safeText(item?.id);
        if (legacyId) {
          const projectData = await getProjectData(companyId, projectId);
          const projectRootPath = safeText(projectData?.sharePointRootPath || projectData?.rootFolderPath) || '';
          const renamed = await renameDriveItemByIdGuarded({
            siteId,
            itemId: legacyId,
            newName: FS_LOG_FILENAME,
            projectRootPath,
            itemPath: storedPath,
          });

          // Update stored metadata to canonical path.
          await patchCompanyProject(companyId, projectId, {
            fragaSvarLog: {
              path: canonicalPath,
              fileName: FS_LOG_FILENAME,
              siteId,
              state: 'ready',
              driveItemId: safeText(renamed?.id) || legacyId,
              webUrl: safeText(renamed?.webUrl) || safeText(item?.webUrl) || null,
              readyAt: serverTimestamp(),
            },
          });

          return { path: canonicalPath };
        }
      } catch (_e) {
        // fallthrough to creation
      }
    }
  }

  // If someone else is creating, best-effort return canonical and let upload succeed later.
  if (txResult?.status !== 'locked') {
    return { path: canonicalPath };
  }

  // Create a minimal workbook (headers only) at canonical path.
  const headers = [
    'FS-ID',
    'Byggdel',
    'Rubrik',
    'Disciplin',
    'Ansvarig',
    'Status',
    'Skapad datum',
    'Svar senast',
    'Senast ändrad',
    'Senast ändrad av',
  ];

  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(ws, [headers], { origin: FS_LOG_TABLE_ORIGIN });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, FS_LOG_SHEET_NAME);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: FS_LOG_MIME });

  await uploadFile({
    file: blob,
    path: canonicalPath,
    companyId: safeText(companyId),
    siteId,
    siteRole: 'projects',
    strictEnsure: true,
  });

  try {
    const item = await getDriveItemByPath(canonicalPath, siteId);
    await patchCompanyProject(companyId, projectId, {
      fragaSvarLog: {
        path: canonicalPath,
        fileName: FS_LOG_FILENAME,
        siteId,
        state: 'ready',
        driveItemId: safeText(item?.id) || null,
        webUrl: safeText(item?.webUrl) || null,
        readyAt: serverTimestamp(),
      },
    });
  } catch (_e) {}

  return { path: canonicalPath };
}

export async function upsertFsLogXlsx({ companyId, projectId, siteId, fsList }) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  const sid = safeText(siteId);
  const list = Array.isArray(fsList) ? fsList : [];

  if (!cid || !pid) throw new Error('companyId och projectId krävs för Excel-synk.');
  if (!sid) throw new Error('siteId saknas för Excel-synk.');

  // Resolve SharePoint FS root folder.
  const project = await getProjectData(cid, pid);
  const rootFolderPath = await resolveProjectRootFolderPath(cid, pid, sid, project);
  const rootFsPath = await resolveFragaSvarRootPath(cid, pid, sid, rootFolderPath);

  const { path } = await ensureFsLogFile({ companyId: cid, projectId: pid, siteId: sid, rootFsPath });
  if (!path) throw new Error('Kunde inte bestämma sökväg för FS-logg.xlsx.');

  const sorted = [...list].filter((x) => x?.deleted !== true).sort((a, b) => {
    const na = String(formatFsNumberFromItem(a) || a?.fsNumber || '').replace(/\D+/g, '');
    const nb = String(formatFsNumberFromItem(b) || b?.fsNumber || '').replace(/\D+/g, '');
    const ia = parseInt(na || '0', 10);
    const ib = parseInt(nb || '0', 10);
    return ia - ib;
  });

  const usedSheetNames = new Set([FS_LOG_SHEET_NAME]);
  const sheetNameById = new Map();

  for (const it of sorted) {
    const id = safeText(it?.id);
    const fsNumber = formatFsNumberFromItem(it) || safeText(it?.fsNumber) || '';
    if (!id || !fsNumber) continue;
    // Strict spec: sheet names must be exactly FS01, FS02, ... (no titles, no suffixes).
    const name = sanitizeExcelSheetName(fsNumber);
    if (!name) continue;
    if (usedSheetNames.has(name)) continue;
    usedSheetNames.add(name);
    sheetNameById.set(id, name);
  }

  const registerHeaders = [
    'FS-ID',
    'Byggdel',
    'Rubrik',
    'Disciplin',
    'Ansvarig',
    'Status',
    'Skapad datum',
    'Svar senast',
    'Senast ändrad',
    'Senast ändrad av',
  ];

  const registerRows = sorted.map((it) => {
    const fsId = formatFsNumberFromItem(it) || safeText(it?.fsNumber) || '';
    const bd = normalizeBd(it?.bd);
    const title = safeText(it?.title) || deriveTitleFromText(it?.question);
    const discipline = displayDiscipline(it);
    const responsibles = normalizeResponsiblesFromItem(it);
    const ansvarig = responsibles
      .map((r) => safeText(r?.name) || '')
      .filter(Boolean)
      .join(', ');
    const status = STATUSES.includes(normalizeStatusValue(it?.status))
      ? normalizeStatusValue(it?.status)
      : 'Obesvarad';
    const createdAt = toYmd(it?.createdAt) || '';
    const needsAnswerBy = normalizeDateYmd(it?.needsAnswerBy) || '';
    const updatedAt = toYmd(it?.updatedAt) || '';
    const updatedBy = safeText(it?.updatedByName) || safeText(it?.createdByName) || '';
    return [
      fsId,
      bd,
      title,
      discipline,
      ansvarig,
      status,
      createdAt,
      needsAnswerBy,
      updatedAt,
      updatedBy,
    ];
  });

  const wsRegister = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsRegister, [registerHeaders, ...registerRows], { origin: FS_LOG_TABLE_ORIGIN });

  for (let i = 0; i < sorted.length; i += 1) {
    const it = sorted[i];
    const id = safeText(it?.id);
    const sheetName = sheetNameById.get(id);
    const fsNumber = formatFsNumberFromItem(it) || safeText(it?.fsNumber) || '';
    if (!sheetName || !fsNumber) continue;

    const status = STATUSES.includes(normalizeStatusValue(it?.status))
      ? normalizeStatusValue(it?.status)
      : 'Obesvarad';
    const rowFill = status === 'Klar'
      ? '#ECFDF5'
      : (status === 'Pågår'
        ? '#FFFBEB'
        : (status === 'Ej aktuell' ? '#F1F5F9' : '#FFF1F2'));

    const r = FS_LOG_TABLE_START_ROW + i; // 0-based row index

    for (let c = 0; c < registerHeaders.length; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!wsRegister[addr]) wsRegister[addr] = { t: 's', v: '' };
      applyFillToCell(wsRegister[addr], rowFill);
    }

    const cellAddr = XLSX.utils.encode_cell({ r, c: 0 });
    const cell = wsRegister[cellAddr];

    const escaped = escapeExcelSheetForLink(sheetName);
    const target = `#'${escaped}'!A1`;
    cell.f = `HYPERLINK(\"${target}\",\"${fsNumber}\")`;
    cell.v = fsNumber;
    cell.t = 's';
    cell.l = { Target: target };

    applyLinkStyleToCell(cell);
  }

  try {
    const lastRow = FS_LOG_TABLE_START_ROW + registerRows.length; // 1-based
    const lastCol = registerHeaders.length - 1;
    const ref = XLSX.utils.encode_range({
      s: { r: FS_LOG_TABLE_START_ROW - 1, c: 0 },
      e: { r: lastRow - 1, c: lastCol },
    });
    wsRegister['!autofilter'] = { ref };
  } catch (_e) {}

  wsRegister['!cols'] = [
    { wch: 10 },
    { wch: 16 },
    { wch: 46 },
    { wch: 16 },
    { wch: 22 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsRegister, FS_LOG_SHEET_NAME);

  for (const it of sorted) {
    const id = safeText(it?.id);
    const sheetName = sheetNameById.get(id);
    if (!id || !sheetName) continue;

    const fsId = formatFsNumberFromItem(it) || safeText(it?.fsNumber) || '';
    const bd = normalizeBd(it?.bd);
    const title = safeText(it?.title) || deriveTitleFromText(it?.question);
    const discipline = displayDiscipline(it);
    const responsibles = normalizeResponsiblesFromItem(it);
    const ansvariga = responsibles.map((r) => safeText(r?.name) || '').filter(Boolean).join(', ');
    const status = STATUSES.includes(normalizeStatusValue(it?.status))
      ? normalizeStatusValue(it?.status)
      : 'Obesvarad';
    const question = safeText(it?.question);
    const answer = safeText(it?.answer);
    const createdAt = toYmd(it?.createdAt) || '';
    const needsAnswerBy = normalizeDateYmd(it?.needsAnswerBy) || '';
    const updatedAt = toYmd(it?.updatedAt) || '';

    const detailRows = [
      ['FS-ID', fsId],
      ['Rubrik', title],
      ['Byggdel', bd],
      ['Disciplin', discipline],
      ['Ansvarig(a)', ansvariga],
      ['Status', status],
      ['Skapad datum', createdAt],
      ['Svar senast', needsAnswerBy],
      ['Senast uppdaterad', updatedAt],
      [],
      ['Fråga / Beskrivning', ''],
      [question],
      [],
      ['Svar', ''],
      [answer],
    ];

    const ws = XLSX.utils.aoa_to_sheet(detailRows);
    ws['!cols'] = [{ wch: 22 }, { wch: 80 }];

    // Apply status color in the FS sheet as well.
    const statusFill = status === 'Klar'
      ? '#ECFDF5'
      : (status === 'Pågår'
        ? '#FFFBEB'
        : (status === 'Ej aktuell' ? '#F1F5F9' : '#FFF1F2'));
    // Status row is the 6th row in detailRows (1-based).
    applyFillToCell(ws['A6'], statusFill);
    applyFillToCell(ws['B6'], statusFill);

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: FS_LOG_MIME });

  await uploadFile({
    file: blob,
    path,
    companyId: cid,
    siteId: sid,
    siteRole: 'projects',
    strictEnsure: true,
  });

  try {
    const item = await getDriveItemByPath(path, sid);
    await patchCompanyProject(cid, pid, {
      fragaSvarLog: {
        path,
        fileName: FS_LOG_FILENAME,
        siteId: sid,
        state: 'ready',
        driveItemId: safeText(item?.id) || null,
        webUrl: safeText(item?.webUrl) || null,
        updatedAt: serverTimestamp(),
      },
    });
  } catch (_e) {}

  return { path };
}

export async function resolveExcelSyncContext(companyId, projectId) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  const key = projectKey(cid, pid);

  const cached = cacheByProjectKey.get(key);
  if (cached && safeText(cached?.siteId)) return cached;

  const project = await getProjectData(cid, pid);
  const siteId = await resolveProjectSiteId(cid, pid, project);

  const ctx = { siteId };
  cacheByProjectKey.set(key, ctx);
  return ctx;
}
