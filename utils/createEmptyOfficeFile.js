/**
 * Create empty Office documents as Blob for upload to SharePoint.
 * Used by the "+ Skapa" dropdown in Förfrågningsunderlag.
 */

import { Document, Packer } from 'docx';
import * as XLSX from 'xlsx-js-style';

/**
 * Create an empty Excel (.xlsx) file as Blob.
 * @returns {Blob}
 */
export function createEmptyXlsxBlob() {
  const ws = XLSX.utils.aoa_to_sheet([[]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Blad1');
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Create an empty Word (.docx) file as Blob.
 * @returns {Promise<Blob>}
 */
export async function createEmptyDocxBlob() {
  const doc = new Document({
    sections: [{ children: [] }],
  });
  return Packer.toBlob(doc);
}
