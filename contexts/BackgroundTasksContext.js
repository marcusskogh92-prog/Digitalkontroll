/**
 * Global bakgrundsaktiviteter – t.ex. "Raderar projekt", "Kör AI-analys".
 * Använd addTask/removeTask för att visa en icke-blockerande indikator.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const BackgroundTasksContext = createContext(null);

export function BackgroundTasksProvider({ children }) {
  const [tasks, setTasks] = useState([]);

  const addTask = useCallback((id, label, detail = '') => {
    if (!id || !label) return;
    setTasks((prev) => {
      const rest = prev.filter((t) => t.id !== id);
      return [...rest, { id, label, detail: detail || '' }];
    });
  }, []);

  const removeTask = useCallback((id) => {
    if (!id) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(
    () => ({ tasks, addTask, removeTask }),
    [tasks, addTask, removeTask]
  );

  return (
    <BackgroundTasksContext.Provider value={value}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

export function useBackgroundTasks() {
  const ctx = useContext(BackgroundTasksContext);
  if (!ctx) {
    return {
      tasks: [],
      addTask: () => {},
      removeTask: () => {},
    };
  }
  return ctx;
}
