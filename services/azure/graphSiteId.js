/**
 * Normalize SharePoint site ID for Microsoft Graph API.
 * Graph expects hostname,site-guid,web-guid (commas). Some sources store
 * hostname.site-guid.web-guid (dots), which causes 404/400. Convert dots to commas.
 * @param {string} siteId - Raw site ID (may use dots instead of commas)
 * @returns {string} Site ID in Graph format
 */
export function normalizeSiteIdForGraph(siteId) {
  const s = String(siteId || '').trim();
  if (!s) return s;
  // If already correct (has comma after hostname and no wrong dots), return as-is
  if (s.includes('.sharepoint.com,') && !s.includes('.sharepoint.com.')) {
    const afterHost = s.split('.sharepoint.com,')[1] || '';
    if (!afterHost.includes('.')) return s; // no dot between guids
  }
  let out = s;
  // Strategy: after ".sharepoint.com" there must be exactly two commas (before first guid, between guids).
  // So: replace the first two dots that appear after ".sharepoint.com" with commas.
  const anchor = '.sharepoint.com';
  const i = out.indexOf(anchor);
  if (i !== -1 && out.length > i + anchor.length) {
    const prefix = out.slice(0, i + anchor.length);
    let suffix = out.slice(i + anchor.length);
    // First dot after hostname -> comma
    if (suffix.startsWith('.')) suffix = ',' + suffix.slice(1);
    // Next dot (between the two GUIDs) -> comma
    const dotIdx = suffix.indexOf('.');
    if (dotIdx >= 0) suffix = suffix.slice(0, dotIdx) + ',' + suffix.slice(dotIdx + 1);
    out = prefix + suffix;
  }
  return out;
}
