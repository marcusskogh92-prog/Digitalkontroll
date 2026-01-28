/**
 * Kalkylskede Service - Business logic for kalkylskede data
 */

import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../../../../components/firebase';

/**
 * Get completion status for a specific item
 */
export async function getItemCompletion(companyId, projectId, sectionId, itemId) {
  if (!companyId || !projectId || !sectionId || !itemId) {
    return { completed: false, progress: 0 };
  }

  try {
    const docRef = doc(
      db,
      'foretag',
      companyId,
      'projects',
      projectId,
      'phaseData',
      'kalkylskede'
    );

    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return { completed: false, progress: 0 };
    }

    const data = docSnap.data();
    const itemKey = `${sectionId}.${itemId}`;
    const itemData = data.items?.[itemKey] || {};

    return {
      completed: itemData.completed || false,
      progress: itemData.progress || 0,
      lastUpdated: itemData.lastUpdated || null,
      updatedBy: itemData.updatedBy || null
    };
  } catch (error) {
    console.error('[kalkylskedeService] Error getting item completion:', error);
    return { completed: false, progress: 0 };
  }
}

/**
 * Update completion status for an item
 */
export async function updateItemCompletion(
  companyId,
  projectId,
  sectionId,
  itemId,
  completion
) {
  if (!companyId || !projectId || !sectionId || !itemId) {
    return false;
  }

  try {
    const docRef = doc(
      db,
      'foretag',
      companyId,
      'projects',
      projectId,
      'phaseData',
      'kalkylskede'
    );

    const itemKey = `${sectionId}.${itemId}`;

    await setDoc(
      docRef,
      {
        items: {
          [itemKey]: {
            completed: completion.completed || false,
            progress: completion.progress || 0,
            lastUpdated: new Date().toISOString(),
            updatedBy: auth.currentUser?.uid || 'system'
          }
        },
        lastModified: new Date().toISOString()
      },
      { merge: true }
    );

    return true;
  } catch (error) {
    console.error('[kalkylskedeService] Error updating item completion:', error);
    return false;
  }
}

/**
 * Get all completion data for a project
 */
export async function getAllCompletions(companyId, projectId) {
  if (!companyId || !projectId) {
    return {};
  }

  try {
    const docRef = doc(
      db,
      'foretag',
      companyId,
      'projects',
      projectId,
      'phaseData',
      'kalkylskede'
    );

    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return {};
    }

    return docSnap.data().items || {};
  } catch (error) {
    console.error('[kalkylskedeService] Error getting all completions:', error);
    return {};
  }
}
