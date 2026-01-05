// Simple in-memory event bus for cross-screen project updates.
// Avoids passing non-serializable callbacks through React Navigation params.

const projectUpdatedListeners = new Set();

export function onProjectUpdated(listener) {
  if (typeof listener !== 'function') return () => {};
  projectUpdatedListeners.add(listener);
  return () => {
    projectUpdatedListeners.delete(listener);
  };
}

export function emitProjectUpdated(updatedProject) {
  for (const listener of projectUpdatedListeners) {
    try {
      listener(updatedProject);
    } catch (e) {
      // ignore
    }
  }
}
