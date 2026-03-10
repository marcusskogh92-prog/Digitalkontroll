/**
 * Project scroll context – scroll offset for project view.
 * Used by ProjectTopbar to show shadow + blur when user has scrolled (sticky nav 2026).
 */

import { createContext, useContext } from 'react';

export const ProjectScrollContext = createContext({ scrollY: 0 });

export function useProjectScroll() {
  const value = useContext(ProjectScrollContext);
  return value && typeof value === 'object' ? value : { scrollY: 0 };
}
