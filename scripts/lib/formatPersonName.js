// Small CommonJS name formatter for scripts
function capToken(token) {
  const str = String(token || '').trim();
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatFromSource(source) {
  const parts = String(source || '')
    .trim()
    .split(/[._\-\s]+/)
    .filter(Boolean);

  if (parts.length === 0) return '';
  if (parts.length === 1) return capToken(parts[0]);
  return (capToken(parts[0]) + ' ' + capToken(parts[parts.length - 1])).trim();
}

module.exports = function formatPersonName(input) {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';
  // If it looks like a full name (contains a space) return as-is but trimmed/capitalized per tokens
  if (raw.includes(' ') && !raw.includes('@')) {
    return raw.split(/\s+/).map(capToken).join(' ').trim();
  }
  const local = raw.includes('@') ? raw.split('@')[0] : raw;
  const formatted = formatFromSource(local);
  return formatted || raw;
};
