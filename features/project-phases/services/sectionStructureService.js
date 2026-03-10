/**
 * Section Structure Service – Per-project överstyring av sektionsmappar.
 * Lagrar i Firestore: foretag/{companyId}/projects/{projectId}/sectionStructure/{sectionId}
 *
 * Stöder: ta bort, byt namn, lägg till, ordna om (display order).
 * SharePoint-mappnamn har nummer (01, 02... 09, 10 för nya). Display utan nummer.
 */

import { doc, getDoc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../components/firebase';

const COLLECTION = 'sectionStructure';

function safeText(v) {
  return String(v ?? '').trim();
}

/**
 * Hämta sektionsstruktur för ett projekt (överstyringar).
 * @param {object} options - { source: 'server' } för att tvinga server-fetch (undvik cachning).
 * @returns {Promise<{items: Array}|null>} items med { id, sharePointName, displayName, order, isCustom?, removed? } eller null
 */
export async function getProjectSectionStructure(companyId, projectId, sectionId, options = {}) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  const sid = safeText(sectionId);
  if (!cid || !pid || !sid) return null;

  try {
    const ref = doc(db, 'foretag', cid, 'projects', pid, COLLECTION, sid);
    const snap = options.source === 'server'
      ? await getDocFromServer(ref)
      : await getDoc(ref);
    if (!snap?.exists()) return null;
    const data = snap.data() || {};
    return { items: Array.isArray(data.items) ? data.items : [] };
  } catch (e) {
    console.warn('[sectionStructureService] getProjectSectionStructure error:', e?.message);
    return null;
  }
}

/**
 * Spara sektionsstruktur för ett projekt.
 * @param {object} params
 * @param {Array} params.items - [{ id, sharePointName, displayName, order, isCustom?, removed? }]
 */
export async function saveProjectSectionStructure(companyId, projectId, sectionId, { items }) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  const sid = safeText(sectionId);
  if (!cid || !pid || !sid) throw new Error('companyId, projectId, sectionId krävs');

  const ref = doc(db, 'foretag', cid, 'projects', pid, COLLECTION, sid);
  await setDoc(ref, {
    items: Array.isArray(items) ? items : [],
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return true;
}

/**
 * Prenumerera på sektionsstruktur – får realtidsuppdateringar.
 * @returns {() => void} Avprenumereringsfunktion
 */
export function subscribeSectionStructure(companyId, projectId, sectionId, onData) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  const sid = safeText(sectionId);
  if (!cid || !pid || !sid) return () => {};
  const ref = doc(db, 'foretag', cid, 'projects', pid, COLLECTION, sid);
  return onSnapshot(ref, (snap) => {
    if (!snap?.exists()) {
      onData({ items: [] });
      return;
    }
    const data = snap.data() || {};
    onData({ items: Array.isArray(data.items) ? data.items : [] });
  }, (e) => {
    console.warn('[sectionStructureService] subscribe error:', e?.message);
    onData({ items: [] });
  });
}
