/**
 * Kalkylskede Layout - Main layout component for kalkylskede phase
 */

import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { onProjectUpdated } from '../../../../components/projectBus';
import PhaseLeftPanel from './components/PhaseLeftPanel';
import PhaseTopNavigator from './components/PhaseTopNavigator';
import { useKalkylskedeNavigation } from './hooks/useKalkylskedeNavigation';
import { useKalkylskedeProgress } from './hooks/useKalkylskedeProgress';

// Import sections
import AnbudSection from './sections/anbud/AnbudSection';
import AnteckningarSection from './sections/anteckningar/AnteckningarSection';
import ForfragningsunderlagSection from './sections/forfragningsunderlag/ForfragningsunderlagSection';
import KalkylSection from './sections/kalkyl/KalkylSection';
import MotenSection from './sections/moten/MotenSection';
import OversiktSection from './sections/oversikt/OversiktSection';

const SECTION_COMPONENTS = {
  oversikt: OversiktSection,
  forfragningsunderlag: ForfragningsunderlagSection,
  kalkyl: KalkylSection,
  anteckningar: AnteckningarSection,
  moten: MotenSection,
  anbud: AnbudSection
};

export default function KalkylskedeLayout({ companyId, projectId, project }) {
  // Use project.id if available, otherwise fall back to projectId prop
  // This ensures we use the latest project ID if it changed
  const effectiveProjectId = project?.id || projectId;
  const { navigation, isLoading: navLoading, loadNavigation, saveNavigation } = useKalkylskedeNavigation(companyId, effectiveProjectId);
  const { sectionProgress, overallProgress, refreshProgress } = useKalkylskedeProgress(
    companyId,
    effectiveProjectId,
    navigation
  );

  const [activeSection, setActiveSection] = useState(null);
  const [activeItem, setActiveItem] = useState(null);
  
  // Listen for project updates to keep in sync if project ID changes
  useEffect(() => {
    const unsubscribe = onProjectUpdated((updatedProject) => {
      try {
        if (!updatedProject || !updatedProject.id) return;
        // If the updated project matches our current project, the parent should handle the update
        // We just need to ensure we're using the latest project.id
        if (updatedProject._idChanged && updatedProject._oldId) {
          const oldId = String(updatedProject._oldId);
          const currentId = String(effectiveProjectId);
          if (currentId === oldId) {
            console.log('[KalkylskedeLayout] Project ID changed from', oldId, 'to', updatedProject.id);
            // The parent component (HomeScreen) should update the project prop,
            // so we'll rely on that. This effect just ensures we're aware of the change.
          }
        }
      } catch (e) {
        console.warn('[KalkylskedeLayout] Error in onProjectUpdated handler:', e);
      }
    });
    
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [effectiveProjectId]);

  // Set default active section when navigation loads
  useEffect(() => {
    if (navigation && navigation.sections && navigation.sections.length > 0 && !activeSection) {
      const firstSection = navigation.sections[0];
      setActiveSection(firstSection.id);
      if (firstSection.items && firstSection.items.length > 0) {
        setActiveItem(firstSection.items[0].id);
      }
    }
  }, [navigation, activeSection]);

  const handleSelectSection = (sectionId) => {
    if (sectionId === null) {
      // Clear selection when section is closed
      setActiveSection(null);
      setActiveItem(null);
      return;
    }
    setActiveSection(sectionId);
    // Set first item in section as active if available
    if (navigation) {
      const section = navigation.sections.find(s => s.id === sectionId);
      if (section && section.items && section.items.length > 0) {
        setActiveItem(section.items[0].id);
      } else {
        setActiveItem(null);
      }
    }
  };

  const handleSelectItem = (sectionId, itemId) => {
    console.log('[KalkylskedeLayout] handleSelectItem called - sectionId:', sectionId, 'itemId:', itemId);
    setActiveSection(sectionId);
    setActiveItem(itemId);
  };

  const renderContent = () => {
    console.log('[KalkylskedeLayout] renderContent - activeSection:', activeSection, 'activeItem:', activeItem);
    
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
    
    console.log('[KalkylskedeLayout] SectionComponent for', activeSection, ':', SectionComponent ? 'Found' : 'Not found');

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
        navigation={navigation.sections.find(s => s.id === activeSection)}
        onProgressUpdate={refreshProgress}
      />
    );
  };

  const projectName = project?.name || project?.id || 'Projekt';

  return (
    <View style={styles.container}>
      {/* Top Navigator */}
      <PhaseTopNavigator
        navigation={navigation}
        sectionProgress={sectionProgress}
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        projectName={projectName}
      />

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {/* Left Panel */}
        <PhaseLeftPanel
          navigation={navigation}
          activeSection={activeSection}
          activeItem={activeItem}
          onSelectSection={handleSelectSection}
          onSelectItem={handleSelectItem}
          projectName={projectName}
          companyId={companyId}
          project={project}
          loadNavigation={loadNavigation}
          saveNavigation={saveNavigation}
        />

        {/* Right Content */}
        <View style={styles.contentArea}>{renderContent()}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6fa',
    height: '100%',
    ...(Platform.OS === 'web' ? {
      maxHeight: '100vh',
      overflow: 'hidden'
    } : {})
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    ...(Platform.OS === 'web' ? {
      minHeight: 0,
      maxHeight: '100%',
      overflow: 'hidden'
    } : {})
  },
  contentArea: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24
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
