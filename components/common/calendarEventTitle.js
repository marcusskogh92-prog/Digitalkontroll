// Shared formatting helpers for calendar titles/subjects.
// Goal: keep stored timeline data clean while allowing different titles per context.

function normalizeSeparatorTrim(s) {
  let out = String(s || '').trim();
  if (!out) return '';
  // Normalize common separators around project numbers.
  if (out.startsWith('-') || out.startsWith('–') || out.startsWith('—')) out = out.slice(1).trim();
  return out;
}

export function extractProjectNumberAndName(project) {
  const p = project && typeof project === 'object' ? project : {};
  const projectNumber = String(p?.projectNumber || p?.number || p?.id || '').trim();
  const rawName = String(p?.projectName || p?.name || '').trim();

  if (!rawName) return { projectNumber, projectName: '' };

  // If the stored name already includes the number prefix, strip it so we can format
  // `[number] – [name] – [type]` without duplication.
  if (projectNumber && rawName.startsWith(projectNumber)) {
    const rest = normalizeSeparatorTrim(rawName.slice(projectNumber.length));
    return { projectNumber, projectName: rest || rawName };
  }

  return { projectNumber, projectName: rawName };
}

export function deriveEventType(item) {
  const it = item && typeof item === 'object' ? item : {};
  const type = String(it?.type || it?.customType || '').trim();
  if (type) return type;
  const title = String(it?.title || '').trim();
  if (title) return title;
  return 'Möte';
}

export function formatExternalCalendarSubject({ projectNumber, projectName, eventType }) {
  const num = String(projectNumber || '').trim();
  const name = String(projectName || '').trim();
  const ty = String(eventType || '').trim();

  // Use en dash to match existing UI conventions.
  const parts = [num, name, ty].filter((x) => !!String(x || '').trim());
  return parts.join(' – ') || 'Händelse';
}

export function formatInternalCalendarLabel(item) {
  return deriveEventType(item);
}
