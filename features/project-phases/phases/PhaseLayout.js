/**
 * Generic Phase Layout - Works for all project phases
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { usePhaseNavigation } from './hooks/usePhaseNavigation';
import { usePhaseProgress } from './hooks/usePhaseProgress';
import PhaseLeftPanel from './kalkylskede/components/PhaseLeftPanel';
import PhaseTopNavigator from './kalkylskede/components/PhaseTopNavigator';

// Import kalkylskede sections (for now, other phases can use these or have their own)
import OversiktSection from './kalkylskede/sections/oversikt/OversiktSection';
import ForfragningsunderlagSection from './kalkylskede/sections/forfragningsunderlag/ForfragningsunderlagSection';
import KalkylSection from './kalkylskede/sections/kalkyl/KalkylSection';
import AnteckningarSection from './kalkylskede/sections/anteckningar/AnteckningarSection';
import MotenSection from './kalkylskede/sections/moten/MotenSection';
import AnbudSection from './kalkylskede/sections/anbud/AnbudSection';

const SECTION_COMPONENTS = {
  oversikt: OversiktSection,
  forfragningsunderlag: ForfragningsunderlagSection,
  kalkyl: KalkylSection,
  anteckningar: AnteckningarSection,
  moten: MotenSection,
  anbud: AnbudSection
};

export default function PhaseLayout({ companyId, projectId, project, phaseKey, hideLeftPanel = false, externalActiveSection = null, externalActiveItem = null, onExternalSectionChange = null, onExternalItemChange = null }) {
  const { navigation, isLoading: navLoading } = usePhaseNavigation(companyId, projectId, phaseKey);
  const { sectionProgress, overallProgress, refreshProgress } = usePhaseProgress(
    companyId,
    projectId,
    phaseKey,
    navigation
  );

  // Use external state if provided (from HomeScreen), otherwise use internal state
  const [internalActiveSection, setInternalActiveSection] = useState(null);
  const [internalActiveItem, setInternalActiveItem] = useState(null);
  
  const activeSection = externalActiveSection !== null ? externalActiveSection : internalActiveSection;
  const activeItem = externalActiveItem !== null ? externalActiveItem : internalActiveItem;
  
  const setActiveSection = (sectionId) => {
    if (onExternalSectionChange) {
      onExternalSectionChange(sectionId);
    } else {
      setInternalActiveSection(sectionId);
    }
  };
  
  const setActiveItem = (itemId) => {
    if (onExternalItemChange) {
      onExternalItemChange(activeSection, itemId);
    } else {
      setInternalActiveItem(itemId);
    }
  };
  
  const [loadingPhase, setLoadingPhase] = useState(true);

  // Set default active section when navigation loads
  useEffect(() => {
    if (navigation && navigation.sections && navigation.sections.length > 0 && !activeSection) {
      const firstSection = navigation.sections[0];
      setActiveSection(firstSection.id);
      // Don't auto-select first item - show section summary instead
      setActiveItem(null);
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
    setActiveItem(null);
  };

  const handleSelectItem = (sectionId, itemId) => {
    setActiveSection(sectionId);
    setActiveItem(itemId);
  };

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
          />
        )}

        {/* Right Content - Takes remaining space */}
        <View style={styles.contentArea}>{renderContent()}</View>
      </View>

      {/* Loading overlay */}
      {loadingPhase && (
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6fa',
    height: '100%',
    width: '100%'
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row'
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
