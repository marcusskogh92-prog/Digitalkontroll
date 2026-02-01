export function safeText(value) {
  return String(value ?? '').trim();
}

export function fileExtFromName(name) {
  const s = safeText(name);
  const m = s.match(/\.([a-zA-Z0-9]+)$/);
  return m ? String(m[1] || '').trim().toLowerCase() : '';
}

export function classifyFileType(nameOrType) {
  const s = safeText(nameOrType).toLowerCase();
  const ext = fileExtFromName(s) || s;

  if (ext === 'pdf') return { kind: 'pdf', label: 'PDF', icon: 'document-text-outline' };
  if (['doc', 'docx'].includes(ext)) return { kind: 'word', label: 'Word', icon: 'document-outline' };
  if (['xls', 'xlsx'].includes(ext)) return { kind: 'excel', label: 'Excel', icon: 'grid-outline' };
  if (ext === 'dwg') return { kind: 'dwg', label: 'DWG', icon: 'cube-outline' };
  if (ext === 'ifc') return { kind: 'ifc', label: 'IFC', icon: 'cube-outline' };
  if (ext === 'zip') return { kind: 'zip', label: 'ZIP', icon: 'archive-outline' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
    return { kind: 'image', label: 'Bild', icon: 'image-outline' };
  }

  if (ext) return { kind: 'file', label: ext.toUpperCase(), icon: 'document-outline' };
  return { kind: 'file', label: 'FIL', icon: 'document-outline' };
}

export function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let v = n;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  const precision = idx === 0 ? 0 : idx === 1 ? 0 : 1;
  return `${v.toFixed(precision)} ${units[idx]}`;
}

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'dwg',
  'ifc',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'zip',
]);

export function isAllowedUploadFile(file) {
  const name = safeText(file?.name);
  const ext = fileExtFromName(name);
  return Boolean(ext && ALLOWED_UPLOAD_EXTENSIONS.has(ext));
}

export function dedupeFileName(originalName, existingNamesLowerSet) {
  const raw = safeText(originalName) || `fil_${Date.now()}`;
  const existing = existingNamesLowerSet instanceof Set ? existingNamesLowerSet : new Set();

  const lower = raw.toLowerCase();
  if (!existing.has(lower)) return raw;

  const ext = fileExtFromName(raw);
  const base = ext ? raw.slice(0, -(ext.length + 1)) : raw;

  for (let i = 1; i < 1000; i += 1) {
    const candidate = ext ? `${base} (${i}).${ext}` : `${base} (${i})`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }

  return `${Date.now()}_${raw}`;
}
