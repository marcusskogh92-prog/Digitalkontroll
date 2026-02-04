/**
 * Navigation Service - Handles navigation structure storage and retrieval
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../../../components/firebase';
import { getDefaultNavigationForProject } from '../../../constants';

const NAV_SCHEMA_VERSION = 2;

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function compactKey(value) {
  // Keep only a-z/0-9 to make comparisons resilient to punctuation, accents, and spacing.
  return normalizeKey(value).replace(/[^a-z0-9]+/g, '');
}

function looksLikeLegacyOfferterSection(section) {
  if (!section || typeof section !== 'object') return false;
  const id = normalizeKey(section?.id);
  const name = normalizeKey(section?.name);
  const idC = compactKey(section?.id);
  const nameC = compactKey(section?.name);
  const compactLooksLikeOfferter =
    (idC.includes('ue') && (idC.includes('offerter') || idC.includes('offert'))) ||
    (nameC.includes('ue') && (nameC.includes('offerter') || nameC.includes('offert')));
  return (
    id === 'ue-offerter' ||
    id === 'ue och offerter' ||
    name.includes('ue och offerter') ||
    name.includes('ue & offerter') ||
    name.includes('ue &offerter') ||
    compactLooksLikeOfferter
  );
}

function mergeSectionItems(primaryItems, secondaryItems) {
  const a = Array.isArray(primaryItems) ? primaryItems.filter(Boolean) : [];
  const b = Array.isArray(secondaryItems) ? secondaryItems.filter(Boolean) : [];
  if (a.length === 0) return b;
  if (b.length === 0) return a;

  const byId = new Map();
  for (const it of a) {
    const id = String(it?.id || '').trim();
    if (!id) continue;
    byId.set(id, it);
  }
  for (const it of b) {
    const id = String(it?.id || '').trim();
    if (!id) continue;
    // Prefer later item props, but preserve nested items if present.
    const prev = byId.get(id);
    if (prev && (Array.isArray(prev?.items) || Array.isArray(it?.items))) {
      byId.set(id, { ...prev, ...it, items: mergeSectionItems(prev?.items, it?.items) });
    } else {
      byId.set(id, { ...(prev || {}), ...(it || {}) });
    }
  }

  // Preserve any items without ids (rare) by appending them.
  const noId = [...a, ...b].filter((it) => !String(it?.id || '').trim());
  return [...Array.from(byId.values()), ...noId];
}

function mergeSections(primary, secondary) {
  const p = primary && typeof primary === 'object' ? primary : {};
  const s = secondary && typeof secondary === 'object' ? secondary : {};
  return {
    ...p,
    ...s,
    items: mergeSectionItems(p?.items, s?.items),
  };
}

function migrateStoredSectionId(section) {
  if (!section || typeof section !== 'object') return section;
  // Map legacy UE/Offerter to canonical Offerter section id.
  if (looksLikeLegacyOfferterSection(section)) {
    return { ...section, id: 'offerter' };
  }
  return section;
}

function normalizeStoredNavigation(storedNav) {
  const nav = storedNav && typeof storedNav === 'object' ? storedNav : {};
  const sections = Array.isArray(nav.sections) ? nav.sections : [];

  // Map legacy ids -> current ids.
  const migrated = sections.map(migrateStoredSectionId).filter(Boolean);

  // Deduplicate by id and MERGE (so legacy/custom duplicates don't lose custom items).
  const byId = new Map();
  for (const s of migrated) {
    const sid = String(s?.id || '').trim();
    if (!sid) continue;
    const prev = byId.get(sid);
    byId.set(sid, prev ? mergeSections(prev, s) : s);
  }

  return {
    ...nav,
    sections: Array.from(byId.values()),
  };
}

function normalizeSections(sections) {
  return Array.isArray(sections) ? sections.filter(Boolean) : [];
}

function mergeItemsWithDefaults(defaultItems, storedItems) {
  const defaults = Array.isArray(defaultItems) ? defaultItems.filter(Boolean) : [];
  const stored = Array.isArray(storedItems) ? storedItems.filter(Boolean) : null;

  // If stored items are missing or empty, backfill from defaults.
  // (Empty arrays in stored docs are almost always legacy/partial saves.)
  if (!stored || stored.length === 0) return defaults;

  const storedById = new Map(stored.map((it) => [it?.id, it]));

  const mergeOne = (def, st) => {
    const merged = {
      ...(def || {}),
      ...(st || {}),
      // Always prefer default names/order/components for known items.
      name: def?.name,
      order: def?.order,
      component: def?.component,
    };

    // Support nested item lists if they exist.
    const defNested = Array.isArray(def?.items) ? def.items : null;
    const stNested = Array.isArray(st?.items) ? st.items : null;
    if (defNested || stNested) {
      merged.items = mergeItemsWithDefaults(defNested || [], stNested || []);
    }

    return merged;
  };

  const merged = defaults.map((def) => mergeOne(def, def?.id ? storedById.get(def.id) : null)).filter(Boolean);

  // Preserve any custom items that don't exist in defaults.
  const defaultIds = new Set(defaults.map((it) => it?.id).filter(Boolean));
  for (const st of stored) {
    if (!st?.id) continue;
    if (defaultIds.has(st.id)) continue;
    merged.push(st);
  }

  return merged;
}

function mergeNavigationWithDefaults(defaultNav, storedNav) {
  const defaultSections = normalizeSections(defaultNav?.sections);
  const normalizedStored = normalizeStoredNavigation(storedNav);
  const storedSections = normalizeSections(normalizedStored?.sections);

  const storedById = new Map(storedSections.map((s) => [s?.id, s]));

  // IMPORTANT UX/SYNC RULE:
  // Section `name` (numeric prefix) + `order` must remain in sync with the versioned
  // SharePoint structure (v1/v2). Company-level stored navigation may contain legacy
  // ordering; it must not override the versioned prefixes.
  const mergedSections = defaultSections
    .map((def) => {
      const stored = def?.id ? storedById.get(def.id) : null;
      return {
        ...(def || {}),
        ...(stored || {}),
        // Always use versioned defaults for ordering + names (prefixes).
        name: def?.name,
        order: def?.order,
        items: mergeItemsWithDefaults(def?.items, stored?.items),
      };
    })
    .filter(Boolean);

  // Preserve any custom sections that don't exist in defaults.
  const defaultIds = new Set(defaultSections.map((s) => s?.id).filter(Boolean));
  for (const stored of storedSections) {
    if (!stored?.id) continue;
    if (defaultIds.has(stored.id)) continue;
    mergedSections.push(stored);
  }

  return {
    ...defaultNav,
    ...normalizedStored,
    sections: mergedSections,
  };
}

/**
 * Get navigation structure for a project phase
 * Returns custom navigation if exists, otherwise default
 * Now stores at company level, not per project
 */
export async function getProjectPhaseNavigation(companyId, projectId, phaseKey, project = null) {
  if (!companyId || !phaseKey) {
    return getDefaultNavigationForProject(phaseKey, project);
  }

  try {
    // Store navigation at company level, not per project
    const docRef = doc(
      db,
      'foretag',
      companyId,
      'phaseNavigation',
      phaseKey
    );

    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() || {};
      const defaultNav = getDefaultNavigationForProject(phaseKey, project);

      // Always merge with defaults so legacy/partial docs don't hide section items
      // (e.g. Översikt showing "Tom mapp").
      const merged = mergeNavigationWithDefaults(defaultNav, data);

      return {
        ...merged,
        schemaVersion: Number(data?.schemaVersion || 0) || NAV_SCHEMA_VERSION,
        isDefault: false
      };
    }

    // Return default navigation
    const defaultNav = getDefaultNavigationForProject(phaseKey, project);
    return {
      ...defaultNav,
      isDefault: true
    };
  } catch (error) {
    console.error('[navigationService] Error fetching navigation:', error);
    return getDefaultNavigationForProject(phaseKey, project);
  }
}

/**
 * Save custom navigation structure
 * Now stores at company level, not per project
 */
export async function saveProjectPhaseNavigation(
  companyId,
  projectId,
  phaseKey,
  navigation
) {
  if (!companyId || !phaseKey) {
    return false;
  }

  try {
    // Store navigation at company level, not per project
    const docRef = doc(
      db,
      'foretag',
      companyId,
      'phaseNavigation',
      phaseKey
    );

    await setDoc(
      docRef,
      {
        ...navigation,
        schemaVersion: NAV_SCHEMA_VERSION,
        lastModified: new Date().toISOString(),
        modifiedBy: auth.currentUser?.uid || 'system',
        version: (navigation.version || 0) + 1
      },
      { merge: true }
    );

    return true;
  } catch (error) {
    console.error('[navigationService] Error saving navigation:', error);
    return false;
  }
}

/**
 * Add a new section
 */
export async function addSection(companyId, projectId, phaseKey, section) {
  const navigation = await getProjectPhaseNavigation(companyId, projectId, phaseKey);

  const newSection = {
    id: `section-${Date.now()}`,
    name: section.name,
    icon: section.icon || 'folder-outline',
    order: navigation.sections.length + 1,
    items: []
  };

  navigation.sections.push(newSection);
  navigation.sections.sort((a, b) => a.order - b.order);

  return await saveProjectPhaseNavigation(companyId, projectId, phaseKey, navigation);
}

/**
 * Remove a section
 */
export async function removeSection(companyId, projectId, phaseKey, sectionId) {
  const navigation = await getProjectPhaseNavigation(companyId, projectId, phaseKey);

  navigation.sections = navigation.sections.filter(s => s.id !== sectionId);

  return await saveProjectPhaseNavigation(companyId, projectId, phaseKey, navigation);
}

/**
 * Add an item to a section
 */
export async function addItem(
  companyId,
  projectId,
  phaseKey,
  sectionId,
  item,
  parentItemId = null
) {
  const navigation = await getProjectPhaseNavigation(companyId, projectId, phaseKey);

  const section = navigation.sections.find(s => s.id === sectionId);
  if (!section) return false;

  const newItem = {
    id: `item-${Date.now()}`,
    name: item.name,
    component: item.component || `${item.name.replace(/\s+/g, '')}View`,
    order: item.order || (section.items.length + 1),
    enabled: true
  };

  if (parentItemId) {
    // Add to nested item
    const parentItem = section.items.find(i => i.id === parentItemId);
    if (parentItem && parentItem.type === 'nested') {
      parentItem.items = parentItem.items || [];
      parentItem.items.push(newItem);
      parentItem.items.sort((a, b) => a.order - b.order);
    }
  } else {
    // Add directly to section
    section.items.push(newItem);
    section.items.sort((a, b) => a.order - b.order);
  }

  return await saveProjectPhaseNavigation(companyId, projectId, phaseKey, navigation);
}

/**
 * Remove an item
 */
export async function removeItem(
  companyId,
  projectId,
  phaseKey,
  sectionId,
  itemId,
  parentItemId = null
) {
  const navigation = await getProjectPhaseNavigation(companyId, projectId, phaseKey);

  const section = navigation.sections.find(s => s.id === sectionId);
  if (!section) return false;

  if (parentItemId) {
    const parentItem = section.items.find(i => i.id === parentItemId);
    if (parentItem && parentItem.items) {
      parentItem.items = parentItem.items.filter(i => i.id !== itemId);
    }
  } else {
    section.items = section.items.filter(i => i.id !== itemId);
  }

  return await saveProjectPhaseNavigation(companyId, projectId, phaseKey, navigation);
}
