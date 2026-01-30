// UI-only label helpers (do not affect SharePoint structure or sorting)

/**
 * Strips a leading numeric ordering prefix used for SharePoint sorting, e.g.
 * "01 - Översikt" -> "Översikt".
 *
 * This is intentionally conservative (1–2 digits) so project numbers like
 * "2222 – Test" are not modified.
 */
export function stripNumberPrefixForDisplay(value) {
  const s = String(value || '').trim();
  if (!s) return '';

  // Match: "01 - ", "01-", "01 – ", "01 — ", "01. "
  const stripped = s.replace(/^\s*\d{1,2}\s*(?:[-–—]|\.)\s*/, '');
  return stripped.trim();
}
