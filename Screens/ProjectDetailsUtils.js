import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatPersonName } from '../components/formatPersonName';

// Note: `expo-file-system` is used only on native; avoid static top-level import.
let FileSystem = null;

export function normalizeControl(obj) {
  const c = { ...(obj || {}) };
  c.materialDesc = c.materialDesc || c.material || '';
  c.qualityDesc = c.qualityDesc || '';
  c.coverageDesc = c.coverageDesc || '';
  if (c.mottagningsSignature && !c.mottagningsSignatures) c.mottagningsSignatures = [];
  if (!c.mottagningsSignatures) c.mottagningsSignatures = [];
  if (!Array.isArray(c.checklist)) c.checklist = [];
  return c;
}

export function normalizeProject(p) {
  if (!p || typeof p !== 'object') return p;
  const formatted = formatPersonName(p.ansvarig || '');

  const safeText = (s) => String(s || '').trim();
  const pn = safeText(p.projectNumber) || safeText(p.number) || safeText(p.id) || '';
  const pnm = safeText(p.projectName) || safeText(p.name) || '';
  const fullName = safeText(p.fullName) || (pn && pnm ? `${pn} - ${pnm}` : (pnm || pn || ''));

  const next = {
    ...p,
    projectNumber: pn || null,
    projectName: pnm || null,
    fullName,
  };

  if (!formatted || formatted === p.ansvarig) return next;
  return { ...next, ansvarig: formatted };
}

export const persistDraftObject = async (draftObj) => {
  let arr = [];
  try {
    const raw = await AsyncStorage.getItem('draft_controls');
    if (raw) arr = JSON.parse(raw) || [];
  } catch (_e) { arr = []; }
  let idx = -1;
  if (draftObj && draftObj.id) {
    idx = arr.findIndex(c => c.id === draftObj.id && c.project?.id === draftObj.project?.id && c.type === draftObj.type);
  }
  if (idx === -1 && draftObj && draftObj.project) {
    idx = arr.findIndex(c => c.project?.id === draftObj.project?.id && c.type === draftObj.type);
  }
  if (idx !== -1) {
    arr[idx] = { ...(arr[idx] || {}), ...(draftObj || {}) };
  } else {
    arr.push(draftObj);
  }
  try { await AsyncStorage.setItem('draft_controls', JSON.stringify(arr)); } catch (_e) {}
  return arr;
};

export async function readUriAsBase64(uri) {
  if (!uri) return null;
  try {
    if (!FileSystem) {
      try {
        FileSystem = await import('expo-file-system');
      } catch (_e) {
        FileSystem = null;
      }
    }
    if (typeof uri === 'string' && uri.startsWith('data:')) {
      const parts = uri.split(',');
      return parts[1] || null;
    }
    const encodingOption = (FileSystem && FileSystem.EncodingType && FileSystem.EncodingType.Base64) ? FileSystem.EncodingType.Base64 : 'base64';
    if (!FileSystem || typeof FileSystem.readAsStringAsync !== 'function') return null;
    const b = await FileSystem.readAsStringAsync(uri, { encoding: encodingOption });
    return b;
  } catch (e) {
    console.warn('[PDF] readUriAsBase64 failed for', uri, e);
    return null;
  }
}

export async function toDataUri(uri) {
  if (!uri) return uri;
  try {
    if (typeof uri === 'string' && uri.startsWith('data:')) return uri;
    const b = await readUriAsBase64(uri);
    if (b) return 'data:image/jpeg;base64,' + b;
    if (/^https?:\/\//i.test(uri)) {
      try {
        if (!FileSystem) {
          try { FileSystem = await import('expo-file-system'); } catch (_e) { FileSystem = null; }
        }
        const fileName = 'pdf-img-' + (Math.random().toString(36).slice(2, 9)) + '.jpg';
        const baseDir = (FileSystem && (FileSystem.cacheDirectory || FileSystem.documentDirectory)) ? (FileSystem.cacheDirectory || FileSystem.documentDirectory) : null;
        if (baseDir && FileSystem && typeof FileSystem.downloadAsync === 'function') {
          const dest = baseDir + fileName;
          const dl = await FileSystem.downloadAsync(uri, dest);
          if (dl && dl.uri) {
            const b2 = await readUriAsBase64(dl.uri);
            if (b2) return 'data:image/jpeg;base64,' + b2;
          }
        }
      } catch (_e) {}
    }
  } catch (e) {
    console.warn('[PDF] toDataUri failed for', uri, e);
  }
  return uri;
}

export async function embedImagesInControl(ctrl) {
  if (!ctrl || typeof ctrl !== 'object') return ctrl;
  const c = JSON.parse(JSON.stringify(ctrl));
  try {
    const photoFields = ['mottagningsPhotos', 'photos'];
    for (const field of photoFields) {
      if (Array.isArray(c[field]) && c[field].length > 0) {
        const mapped = await Promise.all(c[field].map(async (p) => {
          try {
            if (!p) return p;
            if (typeof p === 'string') {
              const d = await toDataUri(p);
              return d || p;
            }
            const src = p.uri || p;
            const d = await toDataUri(src);
            return Object.assign({}, p, { uri: d || src });
          } catch (_e) { return p; }
        }));
        c[field] = mapped;
      }
    }

    const signFields = ['signatures', 'mottagningsSignatures'];
    for (const field of signFields) {
      if (Array.isArray(c[field]) && c[field].length > 0) {
        const mapped = await Promise.all(c[field].map(async (s) => {
          if (!s) return s;
          if (typeof s === 'string') {
            const d = await toDataUri(s);
            return d || s;
          }
          const src = s.uri || s;
          const d = await toDataUri(src);
          return Object.assign({}, s, { uri: d || src });
        }));
        c[field] = mapped;
      }
    }

    if (Array.isArray(c.checklist) && c.checklist.length > 0) {
      const mappedChecklist = await Promise.all(c.checklist.map(async (item) => {
        if (!item || !item.photo) return item;
        const d = await toDataUri(item.photo);
        return Object.assign({}, item, { photo: d || item.photo });
      }));
      c.checklist = mappedChecklist;
    }
  } catch (_e) {}
  return c;
}

export function getWeekAndYear(dateInput) {
  const date = new Date(dateInput);
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  const year = target.getFullYear();
  return { week, year };
}

export function isValidIsoDateYmd(value) {
  if (!value || typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}` === value;
}
