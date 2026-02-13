/**
 * Generic Phase Layout - Works for all project phases
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import ProjectSubTopbar from '../../../components/common/ProjectSubTopbar';
import ProjectTopbar from '../../../components/common/ProjectTopbar';
import { DEFAULT_PHASE, getProjectPhase, PROJECT_PHASES } from '../../../features/projects/constants';
import { stripNumberPrefixForDisplay } from '../../../utils/labelUtils';
import { usePhaseNavigation } from './hooks/usePhaseNavigation';
import { useProjectNavigation } from './hooks/useProjectNavigation';
import PhaseLeftPanel from './kalkylskede/components/PhaseLeftPanel';

// Import kalkylskede sections (for now, other phases can use these or have their own)
import AnbudSection from './kalkylskede/sections/anbud/AnbudSection';
import AnteckningarSection from './kalkylskede/sections/anteckningar/AnteckningarSection';
import ForfragningsunderlagSection from './kalkylskede/sections/forfragningsunderlag/ForfragningsunderlagSection';
import KalkylSection from './kalkylskede/sections/kalkyl/KalkylSection';
import MotenSection from './kalkylskede/sections/moten/MotenSection';
import OversiktSection from './kalkylskede/sections/oversikt/OversiktSection';

const SECTION_COMPONENTS = {
  oversikt: OversiktSection,
  forfragningsunderlag: ForfragningsunderlagSection,
  kalkyl: KalkylSection,
  anteckningar: AnteckningarSection,
  moten: MotenSection,
  anbud: AnbudSection
};

export default function PhaseLayout({ companyId, projectId, project, phaseKey, hideLeftPanel = false, externalActiveSection = null, externalActiveItem = null, externalActiveNode = null, onExternalSectionChange = null, onExternalItemChange = null, onPhaseChange = null, reactNavigation = null, afRelativePath = '', setAfRelativePath = null, afSelectedItemId = null, setAfSelectedItemId = null, bumpAfMirrorRefreshNonce = null, onHeaderLabelsChange = null }) {
  const { navigation, isLoading: navLoading } = usePhaseNavigation(companyId, projectId, phaseKey, project);

  const formatNavLabel = (value) => stripNumberPrefixForDisplay(value);

  // Use external state if provided (from HomeScreen), otherwise use internal state
  const [internalActiveSection, setInternalActiveSection] = useState(null);
  const [internalActiveItem, setInternalActiveItem] = useState(null);
  const [internalActiveNode, setInternalActiveNode] = useState(null);
  
  const activeSection = externalActiveSection !== null ? externalActiveSection : internalActiveSection;
  const activeItem = externalActiveItem !== null ? externalActiveItem : internalActiveItem;
  const activeNode = externalActiveNode !== null ? externalActiveNode : internalActiveNode;
  
  const setActiveSection = (sectionId) => {
    if (onExternalSectionChange) {
      onExternalSectionChange(sectionId);
    } else {
      setInternalActiveSection(sectionId);
    }
  };
  
  const setActiveItem = (sectionId, itemId, meta = null) => {
    if (onExternalItemChange) {
      onExternalItemChange(sectionId, itemId, meta);
    } else {
      setInternalActiveItem(itemId);

      if (meta && Object.prototype.hasOwnProperty.call(meta, 'activeNode')) {
        setInternalActiveNode(meta.activeNode || null);
      } else if (!itemId) {
        setInternalActiveNode(null);
      }
    }
  };
  
  const [loadingPhase, setLoadingPhase] = useState(true);

  // Set default active section when navigation loads
  useEffect(() => {
    const sections = navigation?.sections ?? [];
    if (navigation && Array.isArray(sections) && sections.length > 0 && !activeSection) {
      const firstSection = sections[0];
      setActiveSection(firstSection.id);
      // Don't auto-select first item - show section summary instead
      setActiveItem(firstSection.id, null, { activeNode: null });
    }
  }, [navigation, activeSection]);

  // Show loading indicator when opening phase
  useEffect(() => {
    if (companyId && projectId && phaseKey) {
      setLoadingPhase(true);
      const timer = setTimeout(() => {
        setLoadingPhase(false);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setLoadingPhase(false);
    }
  }, [companyId, projectId, phaseKey]);

  const handleSelectSection = (sectionId) => {
    setActiveSection(sectionId);
    // Don't auto-select first item - show section summary instead
    setActiveItem(sectionId, null, { activeNode: null });
  };

  const handleSelectItem = (sectionId, itemId, meta = null) => {
    setActiveSection(sectionId);
    setActiveItem(sectionId, itemId, meta);
  };

  const { sections: navSections, subMenuItems, activeSectionConfig } = useProjectNavigation(navigation, activeSection);
  const activeItemConfig = activeSectionConfig && activeItem
    ? (activeSectionConfig.items || []).find(i => i.id === activeItem) || null
    : null;

  const headerSectionLabel = activeSectionConfig ? formatNavLabel(activeSectionConfig.name) : '';
  const headerItemLabel = activeItemConfig ? formatNavLabel(activeItemConfig.name) : '';

  // Rapportera header-labels till parent (t.ex. MinimalTopbar) så rubriken kan visas på samma rad som kalender.
  useEffect(() => {
    if (typeof onHeaderLabelsChange === 'function') {
      onHeaderLabelsChange({ sectionLabel: headerSectionLabel, itemLabel: headerItemLabel });
    }
  }, [onHeaderLabelsChange, headerSectionLabel, headerItemLabel]);

  // Background should only be visible for Översikt + 5 specific subpages.
  const bgEnabledItemIds = new Set([
    'checklista',
    'projektinfo',
    'organisation-roller',
    'tidsplan-viktiga-datum',
    'status-beslut',
  ]);

  const shouldUseProjectBackground =
    String(activeSection || '') === 'oversikt' &&
    (!activeItem || bgEnabledItemIds.has(String(activeItem || '')));

  const lockViewportForSection = Platform.OS === 'web' && String(activeSection || '') === 'forfragningsunderlag';

  const renderContent = () => {
    if (navLoading || !navigation) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Laddar...</Text>
        </View>
      );
    }

    if (!activeSection) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Välj en sektion för att börja</Text>
        </View>
      );
    }

    const SectionComponent = SECTION_COMPONENTS[activeSection];

    if (!SectionComponent) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Sektion "{activeSection}" hittades inte</Text>
        </View>
      );
    }

    return (
      <SectionComponent
        projectId={projectId}
        companyId={companyId}
        project={project}
        activeItem={activeItem}
        activeNode={activeNode}
        afRelativePath={afRelativePath}
        setAfRelativePath={setAfRelativePath}
        afSelectedItemId={afSelectedItemId}
        setAfSelectedItemId={setAfSelectedItemId}
        bumpAfMirrorRefreshNonce={bumpAfMirrorRefreshNonce}
        navigation={(navigation?.sections || []).find(s => s.id === activeSection)}
        onSelectItem={handleSelectItem}
        hidePageHeader
      />
    );
  };

  const projectName = project?.name || project?.id || 'Projekt';
  const [phaseDropdownOpen, setPhaseDropdownOpen] = useState(false);
  const [changingPhase, setChangingPhase] = useState(false);
  const [pendingPhaseChange, setPendingPhaseChange] = useState(null);
  
  const currentProjectPhase = getProjectPhase(project);
  const currentPhaseKey = currentProjectPhase?.key || phaseKey || DEFAULT_PHASE;

  // Close dropdown when clicking outside (web only)
  useEffect(() => {
    if (!phaseDropdownOpen || Platform.OS !== 'web') return;
    
    const handleClickOutside = (event) => {
      try {
        const target = event.target;
        if (target && typeof target.closest === 'function') {
          const dropdownElement = document.querySelector('[data-phase-dropdown-project]');
          if (dropdownElement && !dropdownElement.contains(target)) {
            setPhaseDropdownOpen(false);
          }
        }
      } catch (_e) {}
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [phaseDropdownOpen]);

  const handlePhaseChangeRequest = (newPhaseKey) => {
    if (newPhaseKey === currentPhaseKey) {
      setPhaseDropdownOpen(false);
      return;
    }

    const newPhase = PROJECT_PHASES.find(p => p.key === newPhaseKey);
    if (!newPhase) return;

    // Show confirmation dialog
    const phaseName = newPhase.name;
    const currentPhaseName = PROJECT_PHASES.find(p => p.key === currentPhaseKey)?.name || currentPhaseKey;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      const confirmed = window.confirm(
        `Du är på väg att byta projektfas från "${currentPhaseName}" till "${phaseName}".\n\n` +
        `Pågående ändringar kommer att sparas automatiskt.\n\n` +
        `Vill du fortsätta?`
      );
      if (!confirmed) {
        setPhaseDropdownOpen(false);
        return;
      }
    } else {
      Alert.alert(
        'Byt projektfas',
        `Du är på väg att byta projektfas från "${currentPhaseName}" till "${phaseName}".\n\nPågående ändringar kommer att sparas automatiskt.`,
        [
          { text: 'Avbryt', style: 'cancel', onPress: () => setPhaseDropdownOpen(false) },
          { text: 'Fortsätt', onPress: () => proceedWithPhaseChange(newPhaseKey) }
        ]
      );
      return;
    }

    proceedWithPhaseChange(newPhaseKey);
  };

  const proceedWithPhaseChange = async (newPhaseKey) => {
    setPhaseDropdownOpen(false);
    setChangingPhase(true);
    setPendingPhaseChange(newPhaseKey);

    try {
      // Wait a moment to show the loading indicator
      await new Promise(resolve => setTimeout(resolve, 500));

      // Call the phase change handler if provided
      if (onPhaseChange) {
        await onPhaseChange(newPhaseKey);
      }

      // Wait a bit more to ensure smooth transition
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('[PhaseLayout] Error changing phase:', error);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert('Kunde inte byta fas. Försök igen.');
      } else {
        Alert.alert('Fel', 'Kunde inte byta fas. Försök igen.');
      }
    } finally {
      setChangingPhase(false);
      setPendingPhaseChange(null);
    }
  };

  // Handler for home button
  const handleGoHome = () => {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('dkBreadcrumbNavigate', { detail: { target: { kind: 'dashboard' } } }));
        }
      } catch (_e) {}
    }
    if (reactNavigation) {
      try {
        if (reactNavigation.reset) {
          reactNavigation.reset({ index: 0, routes: [{ name: 'Home' }] });
          return;
        }
        reactNavigation.navigate('Home');
      } catch (_e) {}
    }
  };

  // Handler for refresh button
  const handleRefresh = () => {
    // Trigger a refresh by updating a non-existent state to force re-render
    // This is a simple approach - in a real app you might want to reload data
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.location.reload();
      } catch (_e) {}
    }
  };

  const [spinHome, setSpinHome] = useState(0);
  const [spinRefresh, setSpinRefresh] = useState(0);

  return (
    <View style={[styles.container, lockViewportForSection ? styles.lockViewport : null]}>
      {/* Phase selector, home, and refresh buttons are now in GlobalPhaseToolbar - removed from here */}
      {false && onPhaseChange && (
        <View style={[styles.phaseSelectorContainer, styles.stickyNavigation]}>
          {Platform.OS === 'web' ? (
            <div data-phase-dropdown-project style={{ position: 'relative', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {(() => {
              })()}
            </div>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {(() => {
              })()}
            </View>
          )}
        </View>
      )}

      {/* Projekt-rubrik (ikon, nummer, namn, breadcrumb) visas i MinimalTopbar på samma rad som kalender – inte här. */}
      {/* Topbar (primary sections) + Sub-Topbar (section items) */}
      <ProjectTopbar
        sections={navSections}
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
      />
      <ProjectSubTopbar
        subMenuItems={subMenuItems}
        activeItem={activeItem}
        onSelectItem={(itemId) => handleSelectItem(activeSection, itemId, null)}
      />

      {/* Main Content Area - Full width layout */}
      <View style={styles.mainContent}>
        {/* Left Panel - Only show if not hidden */}
        {!hideLeftPanel && (
          <PhaseLeftPanel
            navigation={navigation}
            activeSection={activeSection}
            activeItem={activeItem}
            onSelectSection={handleSelectSection}
            onSelectItem={handleSelectItem}
            projectName={projectName}
            companyId={companyId}
            project={project}
          />
        )}

        {/* Right Content - Takes remaining space (breadcrumb visas redan högst upp) */}
        <View style={[styles.contentArea, shouldUseProjectBackground ? styles.contentAreaTransparent : null]}>
          <View style={[styles.contentBody, lockViewportForSection ? styles.contentBodyLocked : null]}>{renderContent()}</View>
        </View>
      </View>

      {/* Loading overlay - initial load */}
      {loadingPhase && !changingPhase && (
        <Modal
          visible={loadingPhase}
          transparent
          animationType="fade"
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <View style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: 32,
              alignItems: 'center',
              minWidth: 280,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}>
              <ActivityIndicator size="large" color="#1976D2" />
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#263238',
                marginTop: 16,
                textAlign: 'center',
              }}>
                Öppnar projekt
              </Text>
              <Text style={{
                fontSize: 14,
                color: '#546E7A',
                marginTop: 4,
                textAlign: 'center',
              }}>
                Laddar funktioner...
              </Text>
            </View>
          </View>
        </Modal>
      )}

      {/* Phase Change Loading Modal */}
      {changingPhase && pendingPhaseChange && (
        <Modal
          visible={changingPhase}
          transparent
          animationType="fade"
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <View style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: 32,
              alignItems: 'center',
              minWidth: 280,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}>
              <ActivityIndicator size="large" color="#1976D2" />
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#263238',
                marginTop: 16,
                textAlign: 'center',
              }}>
                {(() => {
                  const phaseNames = {
                    'kalkylskede': 'Kalkylskede',
                    'produktion': 'Produktion',
                    'avslut': 'Avslut',
                    'eftermarknad': 'Eftermarknad',
                  };
                  const phaseName = phaseNames[pendingPhaseChange] || 'Laddar...';
                  return `Laddar ${phaseName.toLowerCase()}`;
                })()}
              </Text>
              <Text style={{
                fontSize: 14,
                color: '#546E7A',
                marginTop: 4,
                textAlign: 'center',
              }}>
                Sparar data och laddar innehåll...
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6fa',
    minHeight: 0,
    minWidth: 0,
  },
  lockViewport: {
    ...(Platform.OS === 'web'
      ? {
          height: '100%',
          overflow: 'hidden',
        }
      : null),
  },
  phaseSelectorContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e6e6e6',
  },
  stickyNavigation: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    backgroundColor: '#fff',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    minWidth: 0,
  },
  contentArea: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 0,
    minHeight: 0,
    minWidth: 0,
  },

  contentAreaTransparent: {
    backgroundColor: 'transparent',
  },

  projectHeaderTransparent: {
    backgroundColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  contentBody: {
    flex: 1,
    padding: 24,
    minHeight: 0,
    minWidth: 0,
  },
  contentBodyLocked: {
    ...(Platform.OS === 'web'
      ? {
          overflow: 'hidden',
        }
      : null),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    fontSize: 16,
    color: '#666'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 16,
    color: '#999'
  }
});
