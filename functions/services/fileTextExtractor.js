const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');

function normalizeExtractedText(raw) {
  const s = raw != null ? String(raw) : '';
  // Trim lines and drop empties to avoid massive blank output.
  const lines = s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const out = lines.join('\n').trim();
  return out;
}

async function extractTextFromPdf(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('extractTextFromPdf: buffer must be a Buffer');
  const parser = new PDFParse({ data: buffer });
  try {
    const res = await parser.getText();
    return normalizeExtractedText(res && res.text ? res.text : '');
  } finally {
    // Best-effort cleanup.
    try { await parser.destroy(); } catch (_e) { /* ignore */ }
  }
}

async function extractTextFromDocx(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('extractTextFromDocx: buffer must be a Buffer');
  const res = await mammoth.extractRawText({ buffer });
  return normalizeExtractedText(res && res.value ? res.value : '');
}

function extractTextFromXlsx(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('extractTextFromXlsx: buffer must be a Buffer');
  const wb = xlsx.read(buffer, { type: 'buffer', cellText: false, cellDates: true });
  const chunks = [];

  for (const sheetName of wb.SheetNames || []) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    // Convert to a 2D array; this is the most robust way to capture values.
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const v = cell != null ? String(cell).trim() : '';
        if (v) chunks.push(v);
      }
    }
  }

  return normalizeExtractedText(chunks.join('\n'));
}

function mapMimeTypeToKind(mimeType) {
  const m = String(mimeType || '').trim().toLowerCase();
  if (m === 'application/pdf' || m === 'pdf') return 'pdf';
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || m === 'docx') return 'docx';
  if (m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || m === 'xlsx') return 'xlsx';
  return null;
}

async function extractTextByMimeType({ mimeType, buffer }) {
  const kind = mapMimeTypeToKind(mimeType);
  if (!kind) throw new Error(`Unsupported mimeType for extraction: ${mimeType}`);

  if (kind === 'pdf') return { kind, text: await extractTextFromPdf(buffer) };
  if (kind === 'docx') return { kind, text: await extractTextFromDocx(buffer) };
  if (kind === 'xlsx') return { kind, text: extractTextFromXlsx(buffer) };

  throw new Error(`Unsupported extractor kind: ${kind}`);
}

module.exports = {
  normalizeExtractedText,
  extractTextFromPdf,
  extractTextFromDocx,
  extractTextFromXlsx,
  mapMimeTypeToKind,
  extractTextByMimeType,
};
