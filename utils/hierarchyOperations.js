/**
 * Hierarchy Operations - Utility functions for hierarchy manipulation
 * Extracted from HomeScreen.js to improve code organization
 */

import { Alert, Platform } from 'react-native';

/**
 * Check if project number is unique
 */
export function isProjectNumberUnique(projectId, hierarchy) {
  if (!projectId) return false;
  const targetId = String(projectId).trim();
  if (!targetId) return false;
  
  for (const main of hierarchy) {
    for (const sub of (main.children || [])) {
      for (const child of (sub.children || [])) {
        if (child && child.type === 'project' && String(child.id) === targetId) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Delete a main folder (with confirmation)
 */
export function deleteMainFolderGuarded(mainId, hierarchy, setHierarchy) {
  const mainName = (hierarchy || []).find(m => m.id === mainId)?.name || '';
  if ((hierarchy || []).length <= 1) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert('Kan inte radera.\n\nDet måste finnas minst en huvudmapp.');
    } else {
      Alert.alert('Kan inte radera', 'Det måste finnas minst en huvudmapp.');
    }
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const ok = window.confirm(`Vill du verkligen radera huvudmappen${mainName ? ` "${mainName}"` : ''}?`);
    if (!ok) return;
    setHierarchy(prev => prev.filter(m => m.id !== mainId));
    return;
  }

  Alert.alert('Radera huvudmapp', `Vill du verkligen radera huvudmappen${mainName ? ` "${mainName}"` : ''}?`, [
    { text: 'Avbryt', style: 'cancel' },
    {
      text: 'Radera',
      style: 'destructive',
      onPress: () => setHierarchy(prev => prev.filter(m => m.id !== mainId)),
    },
  ]);
}

/**
 * Delete a sub folder
 */
export function deleteSubFolder(mainId, subId, hierarchy, setHierarchy) {
  const main = (hierarchy || []).find(m => m.id === mainId);
  const subName = (main?.children || []).find(s => s.id === subId)?.name || '';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const ok = window.confirm(`Vill du verkligen radera undermappen${subName ? ` "${subName}"` : ''}?`);
    if (!ok) return;
    setHierarchy(prev => prev.map(m => (
      m.id !== mainId
        ? { ...m, children: (m.children || []).filter(s => s.id !== subId) }
        : m
    )));
    return;
  }

  Alert.alert('Radera undermapp', `Vill du verkligen radera undermappen${subName ? ` "${subName}"` : ''}?`, [
    { text: 'Avbryt', style: 'cancel' },
    {
      text: 'Radera',
      style: 'destructive',
      onPress: () => setHierarchy(prev => prev.map(m => (
        m.id !== mainId
          ? { ...m, children: (m.children || []).filter(s => s.id !== subId) }
          : m
      ))),
    },
  ]);
}

/**
 * Delete a project
 */
export function deleteProject(mainId, subId, projectId, hierarchy, setHierarchy) {
  const main = (hierarchy || []).find(m => m.id === mainId);
  const sub = (main?.children || []).find(s => s.id === subId);
  const projName = (sub?.children || []).find(ch => ch?.type === 'project' && ch.id === projectId)?.name || '';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const ok = window.confirm(`Vill du verkligen radera projektet ${projectId}${projName ? ` — ${projName}` : ''}?`);
    if (!ok) return;
    setHierarchy(prev => prev.map(m => (
      m.id !== mainId
        ? m
        : {
          ...m,
          children: (m.children || []).map(s => (
            s.id !== subId
              ? s
              : { ...s, children: (s.children || []).filter(ch => !(ch?.type === 'project' && ch.id === projectId)) }
          )),
        }
    )));
    return;
  }

  Alert.alert('Radera projekt', `Vill du verkligen radera projektet ${projectId}${projName ? ` — ${projName}` : ''}?`, [
    { text: 'Avbryt', style: 'cancel' },
    {
      text: 'Radera',
      style: 'destructive',
      onPress: () => setHierarchy(prev => prev.map(m => (
        m.id !== mainId
          ? m
          : {
            ...m,
            children: (m.children || []).map(s => (
              s.id !== subId
                ? s
                : { ...s, children: (s.children || []).filter(ch => !(ch?.type === 'project' && ch.id === projectId)) }
            )),
          }
      ))),
    },
  ]);
}

/**
 * Copy a project (web only)
 */
export function copyProjectWeb(mainId, subId, project, hierarchy, setHierarchy, isProjectNumberUniqueFn) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!project || project.type !== 'project') return;

  const suggestedId = String(project.id || '').trim();
  const suggestedName = String(project.name || '').trim();
  const newId = (window.prompt('Nytt projektnummer', suggestedId) || '').trim();
  if (!newId) return;
  if (!isProjectNumberUniqueFn(newId)) {
    Alert.alert('Fel', 'Projektnummer används redan.');
    return;
  }
  const newName = (window.prompt('Nytt projektnamn', suggestedName) || '').trim();
  if (!newName) return;

  const copy = {
    ...project,
    id: newId,
    name: newName,
    createdAt: new Date().toISOString(),
    status: project.status || 'ongoing',
  };

  setHierarchy(prev => prev.map(m => (
    m.id !== mainId
      ? m
      : {
        ...m,
        children: (m.children || []).map(s => (
          s.id !== subId
            ? s
            : { ...s, children: [...(s.children || []), copy] }
        )),
      }
  )));
}
