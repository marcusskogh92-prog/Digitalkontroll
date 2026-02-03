// Dashboard utility functions extracted from HomeScreen.js
// Pure helpers for time formatting and dashboard metrics.

export function toTsMs(value) {
  try {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') return new Date(value).getTime() || 0;
    if (typeof value?.toDate === 'function') return value.toDate().getTime() || 0;
    if (typeof value?.seconds === 'number') {
      return (value.seconds * 1000) + (typeof value.nanoseconds === 'number' ? Math.floor(value.nanoseconds / 1e6) : 0);
    }
    return new Date(value).getTime() || 0;
  } catch (_e) {
    return 0;
  }
}

export function formatRelativeTime(isoLike) {
  try {
    const t = toTsMs(isoLike);
    if (!t) return '';
    const diffMs = Date.now() - t;
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSec < 60) return 'för nyss';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `för ${diffMin} minut${diffMin === 1 ? '' : 'er'} sedan`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `för ${diffH} tim${diffH === 1 ? 'me' : 'mar'} sedan`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `för ${diffD} dag${diffD === 1 ? '' : 'ar'} sedan`;
    return new Date(t).toLocaleDateString('sv-SE');
  } catch (_e) {
    return '';
  }
}

export function computeOpenDeviationsCount(controls) {
  try {
    let open = 0;
    for (const item of (controls || [])) {
      if (!item || item.type !== 'Skyddsrond') continue;
      const sections = Array.isArray(item.checklistSections)
        ? item.checklistSections
        : (Array.isArray(item.checklist) ? item.checklist : null);
      if (!Array.isArray(sections)) continue;
      for (const section of sections) {
        if (!section || !Array.isArray(section.statuses)) continue;
        const points = Array.isArray(section.points) ? section.points : [];
        section.statuses.forEach((status, idx) => {
          if (status !== 'avvikelse') return;
          const pt = points[idx];
          const rem = section.remediation
            ? ((pt !== undefined && pt !== null) ? section.remediation[pt] : null) || section.remediation[idx]
            : null;
          const handled = !!rem;
          if (!handled) open += 1;
        });
      }
    }
    return open;
  } catch (_e) {
    return 0;
  }
}

export function computeControlsToSign(drafts) {
  try {
    let count = 0;
    for (const item of (drafts || [])) {
      if (!item) continue;
      const type = String(item.type || '');
      if (type !== 'Mottagningskontroll' && type !== 'Riskbedömning') continue;
      const sigs = item.mottagningsSignatures;
      if (!Array.isArray(sigs) || sigs.length === 0) count++;
    }
    return count;
  } catch (_e) {
    return 0;
  }
}

// Canonical project identifier used across dashboard membership filtering.
// Standard: projectId === Firestore project_number_index doc.id (e.g. "1010-10").
// Do not rely on SharePoint internal ids or projectNumber-derived strings.
export function resolveProjectId(project) {
  try {
    if (!project) return null;
    if (typeof project === 'string' || typeof project === 'number') {
      const s = String(project).trim();
      return s || null;
    }
    if (typeof project === 'object') {
      const pid = String(project.projectId || project.id || '').trim();
      return pid || null;
    }
    return null;
  } catch (_e) {
    return null;
  }
}

export function countActiveProjectsInHierarchy(hierarchy, allowedProjectIds) {
  try {
    let active = 0;
    for (const main of (hierarchy || [])) {
      for (const sub of (main.children || [])) {
        for (const child of (sub.children || [])) {
          if (child && child.type === 'project') {
            const pid = resolveProjectId(child);
            if (allowedProjectIds && pid && !allowedProjectIds.has(pid)) continue;
            // Status is deprecated; rely on project phase only.
            const phaseKey = String(child?.phase || '').trim().toLowerCase();
            if (phaseKey !== 'avslut') active++;
          }
        }
      }
    }
    return active;
  } catch (_e) {
    return 0;
  }
}

export function countOpenDeviationsForControl(control) {
  try {
    if (!control || control.type !== 'Skyddsrond') return 0;
    const sections = Array.isArray(control.checklistSections)
      ? control.checklistSections
      : (Array.isArray(control.checklist) ? control.checklist : null);
    if (!Array.isArray(sections)) return 0;
    let open = 0;
    for (const section of sections) {
      if (!section || !Array.isArray(section.statuses)) continue;
      const points = Array.isArray(section.points) ? section.points : [];
      for (let i = 0; i < section.statuses.length; i++) {
        if (section.statuses[i] !== 'avvikelse') continue;
        const pt = points[i];
        const rem = section.remediation
          ? ((pt !== undefined && pt !== null) ? section.remediation[pt] : null) || section.remediation[i]
          : null;
        if (!rem) open += 1;
      }
    }
    return open;
  } catch (_e) {
    return 0;
  }
}
