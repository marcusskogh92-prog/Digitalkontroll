/**
 * useProjectNavigation - State-driven project navigation for Topbar + Sub-Topbar
 *
 * Reads from the phase navigation structure (e.g. kalkylskedeStructureDefinition).
 * Use with ProjectTopbar and ProjectSubTopbar for a single source of truth.
 */

import { useMemo } from 'react';

/**
 * @param {object} navigation - From usePhaseNavigation: { phase, sections: [{ id, name, icon, order, items }] }
 * @param {string} activeSection - Current section id
 * @returns {{ sections: array, subMenuItems: array, activeSectionConfig: object | null }}
 */
export function useProjectNavigation(navigation, activeSection) {
  return useMemo(() => {
    const sections = Array.isArray(navigation?.sections) ? navigation.sections : [];
    const activeSectionConfig =
      activeSection != null ? sections.find((s) => s && s.id === activeSection) || null : null;
    const subMenuItems = Array.isArray(activeSectionConfig?.items)
      ? [...activeSectionConfig.items]
          .filter((it) => it && (it.enabled !== false))
          .sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0))
      : [];

    return {
      sections,
      subMenuItems,
      activeSectionConfig,
    };
  }, [navigation, activeSection]);
}
