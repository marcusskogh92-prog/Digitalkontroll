/**
 * Navigation Service - Handles navigation structure storage and retrieval
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../../../components/firebase';
import { getDefaultNavigation } from '../../../constants';

const NAV_SCHEMA_VERSION = 2;

function normalizeSections(sections) {
  return Array.isArray(sections) ? sections.filter(Boolean) : [];
}

function normalizeItems(items, fallbackItems) {
  const a = Array.isArray(items) ? items : null;
  const b = Array.isArray(fallbackItems) ? fallbackItems : [];
  // If stored items are missing or empty, backfill from defaults.
  // (Empty arrays in stored docs are almost always legacy/partial saves.)
  if (!a || a.length === 0) return b;
  return a;
}

function mergeNavigationWithDefaults(defaultNav, storedNav) {
  const defaultSections = normalizeSections(defaultNav?.sections);
  const storedSections = normalizeSections(storedNav?.sections);

  const defaultById = new Map(defaultSections.map((s) => [s?.id, s]));
  const storedIds = new Set(storedSections.map((s) => s?.id).filter(Boolean));

  // Preserve stored section order, but backfill missing content from defaults.
  const mergedSections = storedSections.map((storedSection) => {
    const def = storedSection?.id ? defaultById.get(storedSection.id) : null;
    const fallbackItems = def?.items;
    return {
      ...(def || {}),
      ...storedSection,
      items: normalizeItems(storedSection?.items, fallbackItems),
    };
  });

  // Add any default sections that are missing entirely.
  for (const def of defaultSections) {
    if (!def?.id) continue;
    if (storedIds.has(def.id)) continue;
    mergedSections.push(def);
  }

  return {
    ...defaultNav,
    ...storedNav,
    sections: mergedSections,
  };
}

/**
 * Get navigation structure for a project phase
 * Returns custom navigation if exists, otherwise default
 * Now stores at company level, not per project
 */
export async function getProjectPhaseNavigation(companyId, projectId, phaseKey) {
  if (!companyId || !phaseKey) {
    return getDefaultNavigation(phaseKey);
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
      const defaultNav = getDefaultNavigation(phaseKey);

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
    const defaultNav = getDefaultNavigation(phaseKey);
    return {
      ...defaultNav,
      isDefault: true
    };
  } catch (error) {
    console.error('[navigationService] Error fetching navigation:', error);
    return getDefaultNavigation(phaseKey);
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
