/**
 * Gemensam Excel export/import för register (Kontoplan, Kategorier, Byggdelar).
 * Excel-filen är alltid hela registret (single source of truth); import är ersättande synk.
 * All logik per companyId – ingen global data.
 */

import * as XLSX from 'xlsx-js-style';

/** Normalisera cellvärde till sträng (Excel kan ge tal/datum). */
function cellStr(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v).trim();
}

/** Returnerar true om raden anses tom (alla värden tomma efter trim). */
export function isRowEmpty(row) {
  if (!row || typeof row !== 'object') return true;
  const values = Array.isArray(row) ? row : Object.values(row);
  return values.every((v) => cellStr(v) === '');
}

/**
 * Validera att de faktiska kolumnrubrikerna exakt matchar de krävda.
 * @param {string[]} actualHeaders - rubriker från filen (första raden)
 * @param {string[]} requiredHeaders - exakt ordning och namn
 * @returns {{ valid: boolean, missing?: string[] }}
 */
export function validateHeaders(actualHeaders, requiredHeaders) {
  const actual = (actualHeaders || []).map((h) => cellStr(h));
  const required = (requiredHeaders || []).map((h) => String(h).trim());
  const missing = required.filter((r) => !actual.includes(r));
  return { valid: missing.length === 0, missing };
}

/**
 * Bygg Excel-workbook och trigga nedladdning (web).
 * Om rows är tom skickas endast kolumnrubriker.
 * @param {string} sheetName - arknamn
 * @param {string[]} headers - kolumnrubriker
 * @param {Array<string[]|Record<string,string>>} rows - datarader (array av array eller objekt)
 * @param {string} filenamePrefix - t.ex. "Kontoplan" → Kontoplan_2026-02-04.xlsx
 */
export function buildAndDownloadExcel(sheetName, headers, rows, filenamePrefix) {
  const headerRow = headers.slice();
  const dataRows = (rows || []).map((r) => {
    if (Array.isArray(r)) return r.map((c) => cellStr(c));
    return headers.map((h) => cellStr(r[h] ?? ''));
  });
  const aoa = [headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const filename = `${filenamePrefix}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Parsa Excel-fil från arrayBuffer.
 * Första raden = rubriker, övriga rader = data. Tomma rader ignoreras.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], rows: Record<string,string>[], errors: string[] }}
 */
export function parseExcelFromBuffer(arrayBuffer) {
  const errors = [];
  let headers = [];
  const rows = [];
  try {
    const wb = XLSX.read(arrayBuffer, { type: 'array', raw: false });
    const firstSheet = wb.SheetNames && wb.SheetNames[0];
    if (!firstSheet) {
      errors.push('Excel-filen innehåller inga ark.');
      return { headers: [], rows: [], errors };
    }
    const ws = wb.Sheets[firstSheet];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (!aoa || aoa.length === 0) {
      errors.push('Arkets första rad måste innehålla kolumnrubriker.');
      return { headers: [], rows: [], errors };
    }
    headers = (aoa[0] || []).map((h) => cellStr(h));
    for (let i = 1; i < aoa.length; i++) {
      const rawRow = aoa[i] || [];
      const row = {};
      headers.forEach((h, j) => {
        row[h] = cellStr(rawRow[j]);
      });
      if (!isRowEmpty(row)) rows.push(row);
    }
  } catch (e) {
    errors.push(e?.message || 'Kunde inte läsa Excel-filen.');
  }
  return { headers, rows, errors };
}

/**
 * Beräkna ersättande synk-plan: vad ska skapas, uppdateras och raderas.
 * Excel = fullständig sanning; befintliga poster jämförs mot Excel-nycklar.
 * @param {Record<string,string>[]} excelRows - rader från Excel (objekt med rubrik som nyckel)
 * @param {Array<{ id: string }>} existingItems - befintliga poster från Firestore (måste ha id)
 * @param {{ keyField: string, getKeyFromRow: (row: Record<string,string>) => string, getKeyFromItem: (item: any) => string }} config
 * @returns {{ toCreate: Record<string,string>[], toUpdate: { id: string, item: any, row: Record<string,string> }[], toDelete: any[] }}
 */
export function computeSyncPlan(excelRows, existingItems, config) {
  const { keyField, getKeyFromRow, getKeyFromItem } = config;
  const existingByKey = new Map();
  (existingItems || []).forEach((item) => {
    const k = getKeyFromItem(item);
    if (k != null && k !== '') existingByKey.set(String(k).trim(), item);
  });
  const keysInExcel = new Set();
  const toCreate = [];
  const toUpdate = [];
  (excelRows || []).forEach((row) => {
    const key = getKeyFromRow(row);
    const keyStr = key != null ? String(key).trim() : '';
    if (!keyStr) return; // ignorerar rader utan nyckel
    keysInExcel.add(keyStr);
    const existing = existingByKey.get(keyStr);
    if (existing) {
      toUpdate.push({ id: existing.id, item: existing, row });
    } else {
      toCreate.push(row);
    }
  });
  const toDelete = (existingItems || []).filter((item) => {
    const k = getKeyFromItem(item);
    const keyStr = k != null ? String(k).trim() : '';
    return keyStr !== '' && !keysInExcel.has(keyStr);
  });
  return { toCreate, toUpdate, toDelete };
}

// --- Konfiguration per register (för export/import/synk) ---

/** Kontoplan: Konto, Benämning, Beskrivning. Nyckel = Konto. */
export const KONTOPLAN_EXCEL = {
  sheetName: 'Kontoplan',
  filenamePrefix: 'Kontoplan',
  headers: ['Konto', 'Benämning', 'Beskrivning'],
  keyField: 'Konto',
  rowToPayload(row) {
    return {
      konto: cellStr(row['Konto']),
      benamning: cellStr(row['Benämning']),
      beskrivning: cellStr(row['Beskrivning']),
    };
  },
  itemToKey(item) {
    return item.konto ?? '';
  },
  itemToRow(item) {
    return [item.konto ?? '', item.benamning ?? '', item.beskrivning ?? ''];
  },
};

/** Kategorier: Kategori, Anteckning. Nyckel = Kategori. */
export const KATEGORIER_EXCEL = {
  sheetName: 'Kategorier',
  filenamePrefix: 'Kategorier',
  headers: ['Kategori', 'Anteckning'],
  keyField: 'Kategori',
  rowToPayload(row) {
    return {
      name: cellStr(row['Kategori']),
      note: cellStr(row['Anteckning']),
    };
  },
  itemToKey(item) {
    return item.name ?? '';
  },
  itemToRow(item) {
    return [item.name ?? '', item.note ?? ''];
  },
};

/** Byggdelar: Kod, Namn, Anteckning, Standard. Nyckel = Kod. */
export const BYGGDELAR_EXCEL = {
  sheetName: 'Byggdelar',
  filenamePrefix: 'Byggdelar',
  headers: ['Kod', 'Namn', 'Anteckning', 'Standard'],
  keyField: 'Kod',
  rowToPayload(row) {
    const standardRaw = cellStr(row['Standard']).toLowerCase();
    const isDefault = standardRaw === '1' || standardRaw === 'true' || standardRaw === 'ja' || standardRaw === 'j';
    return {
      code: String(cellStr(row['Kod'])).replace(/\D/g, '').slice(0, 3),
      name: cellStr(row['Namn']),
      notes: cellStr(row['Anteckning']),
      isDefault,
    };
  },
  itemToKey(item) {
    return item.code ?? '';
  },
  itemToRow(item) {
    return [
      item.code ?? '',
      item.name ?? '',
      item.notes ?? '',
      item.isDefault ? '1' : '0',
    ];
  },
};

/**
 * Leverantörer: Leverantör, Org-nr, Ort, Kategorier.
 * Kategorier = komma-separerad text i en cell. Endast komma (,) som avgränsare.
 * Parsing: split på ',', trim() per del, tomma strängar ignoreras.
 * Matchning mot kategoriregister sker case-insensitive; första förekomsten avgör namnet som sparas.
 */
export const LEVERANTORER_EXCEL = {
  sheetName: 'Leverantörer',
  filenamePrefix: 'Leverantorer',
  headers: ['Leverantör', 'Org-nr', 'Ort', 'Kategorier'],
  keyField: 'Org-nr',
  rowToPayload(row) {
    const kategorierStr = cellStr(row['Kategorier']);
    if (!kategorierStr || typeof kategorierStr !== 'string') {
      return {
        companyName: cellStr(row['Leverantör']),
        organizationNumber: cellStr(row['Org-nr']),
        city: cellStr(row['Ort']),
        categories: [],
      };
    }
    const categories = kategorierStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      companyName: cellStr(row['Leverantör']),
      organizationNumber: cellStr(row['Org-nr']),
      city: cellStr(row['Ort']),
      categories,
    };
  },
  itemToKey(item) {
    const org = (item.organizationNumber ?? '').trim();
    const name = (item.companyName ?? '').trim();
    return org || name || '';
  },
  itemToRow(item) {
    const categories = Array.isArray(item.categories) ? item.categories : [];
    return [
      item.companyName ?? '',
      item.organizationNumber ?? '',
      item.city ?? '',
      categories.join(', '),
    ];
  },
};
