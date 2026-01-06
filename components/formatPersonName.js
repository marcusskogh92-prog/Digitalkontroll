// Shared formatter used across the app to show human-friendly names.
// Examples:
// - marcus.skogh@... -> Marcus Skogh
// - fornamn@... -> Fornamn
// - Anna Maria Svensson -> Anna Maria Svensson (unchanged)

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
  return `${capToken(parts[0])} ${capToken(parts[parts.length - 1])}`.trim();
}

export function formatPersonName(input) {
  if (!input) return '';

  // String input: treat as email or already-entered name.
  if (typeof input === 'string') {
    const raw = input.trim();
    if (!raw) return '';
    // Already looks like a full name.
    if (raw.includes(' ') && !raw.includes('@')) return raw;

    const local = raw.includes('@') ? raw.split('@')[0] : raw;
    const formatted = formatFromSource(local);
    return formatted || raw;
  }

  // Object input: pick best available source.
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (displayName && displayName.includes(' ')) return displayName;

  const email = input.email ? String(input.email).trim() : '';
  const uid = input.uid || input.id;

  const source = (email ? email.split('@')[0] : '') || displayName;
  const formatted = formatFromSource(source);

  return formatted || email || uid || '';
}
