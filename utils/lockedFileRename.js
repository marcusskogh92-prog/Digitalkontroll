/**
 * Locked file rename utilities ("Golden Rule")
 *
 * Goal: allow renaming a file's display name without ever changing its type.
 * - UI should edit only the base filename (without extension)
 * - Extension is treated as locked and must be preserved on rename
 */

export function safeText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function fileExtFromName(name) {
  const n = safeText(name).trim();
  if (!n) return '';
  const m = n.match(/\.([a-zA-Z0-9]+)$/);
  if (!m || !m[1]) return '';
  return String(m[1]).trim().toLowerCase();
}

export function splitBaseAndExt(name) {
  const n = safeText(name).trim();
  const ext = fileExtFromName(n);
  const base = ext ? n.slice(0, -(ext.length + 1)) : n;
  return { base: safeText(base).trim(), ext };
}

/**
 * Normalize the user's input for the editable base name.
 * If the user pastes/types a full filename (including extension), strip it,
 * because the extension is locked.
 */
export function normalizeLockedRenameBase(input, lockedExt) {
  const raw = safeText(input).trim();
  const locked = safeText(lockedExt).trim().toLowerCase();
  if (!raw) return '';

  // If the user pastes the full filename, strip any trailing extension.
  const m = raw.match(/^(.*)\.([a-zA-Z0-9]+)$/);
  if (m && m[1]) {
    const typedExt = safeText(m[2]).trim().toLowerCase();
    if (locked && typedExt) {
      // Strip regardless of whether it matches; extension is locked.
      return safeText(m[1]).trim();
    }
  }

  // Also strip a trailing .<lockedExt> (case-insensitive) even if there are spaces.
  if (locked) {
    const suffixRe = new RegExp(`\\.${locked}$`, 'i');
    if (suffixRe.test(raw)) {
      return safeText(raw.replace(suffixRe, '')).trim();
    }
  }

  return raw;
}

/**
 * Build the final file name while preserving the original extension.
 */
export function buildLockedFileRename({ originalName, inputBase, lockedExt = '' }) {
  const { ext: extFromName } = splitBaseAndExt(originalName);
  const ext = safeText(lockedExt).trim().toLowerCase() || extFromName;

  const base = normalizeLockedRenameBase(inputBase, ext);
  const nextName = ext ? `${base}.${ext}` : base;

  return { base, ext, nextName };
}
