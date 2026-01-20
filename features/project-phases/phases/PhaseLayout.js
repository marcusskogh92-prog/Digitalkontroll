/**
 * Generic Phase Layout - Works for all project phases
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal, TouchableOpacity, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePhaseNavigation } from './hooks/usePhaseNavigation';
import { usePhaseProgress } from './hooks/usePhaseProgress';
import PhaseLeftPanel from './kalkylskede/components/PhaseLeftPanel';
import PhaseTopNavigator from './kalkylskede/components/PhaseTopNavigator';
import { PROJECT_PHASES, DEFAULT_PHASE, getProjectPhase } from '../../../features/projects/constants';

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

export default function PhaseLayout({ companyId, projectId, project, phaseKey, hideLeftPanel = false, externalActiveSection = null, externalActiveItem = null, onExternalSectionChange = null, onExternalItemChange = null, onPhaseChange = null, reactNavigation = null }) {
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
    <View style={styles.container}>
      {/* Phase selector, home, and refresh buttons are now in GlobalPhaseToolbar - removed from here */}
      {false && onPhaseChange && (
        <View style={[styles.phaseSelectorContainer, styles.stickyNavigation]}>
          {Platform.OS === 'web' ? (
            <div data-phase-dropdown-project style={{ position: 'relative', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {(() => {
                const currentPhase = PROJECT_PHASES.find(p => p.key === currentPhaseKey) || PROJECT_PHASES[0];
                return (
                  <>
                    {/* Phase Dropdown */}
                    <div style={{ position: 'relative', flex: 1 }}>
                      <TouchableOpacity
                        onPress={() => setPhaseDropdownOpen(!phaseDropdownOpen)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 6,
                          backgroundColor: `${currentPhase.color}15`,
                          borderWidth: 2,
                          borderColor: currentPhase.color,
                        }}
                        activeOpacity={0.7}
                      >
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: currentPhase.color,
                            marginRight: 8,
                          }}
                        />
                        <Ionicons
                          name={currentPhase.icon}
                          size={16}
                          color={currentPhase.color}
                          style={{ marginRight: 8 }}
                        />
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '700',
                            color: currentPhase.color,
                            flex: 1,
                          }}
                        >
                          {currentPhase.name}
                        </Text>
                        <Ionicons
                          name={phaseDropdownOpen ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={currentPhase.color}
                        />
                      </TouchableOpacity>
                    
                    {phaseDropdownOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 16,
                          right: 16,
                          marginTop: 4,
                          backgroundColor: '#fff',
                          borderRadius: 6,
                          borderWidth: 1,
                          borderStyle: 'solid',
                          borderColor: '#e0e0e0',
                          boxShadow: '0px 4px 12px rgba(0,0,0,0.15)',
                          zIndex: 1000,
                          overflow: 'hidden',
                        }}
                      >
                        {PROJECT_PHASES.map(phase => {
                          const isSelected = currentPhaseKey === phase.key;
                          return (
                            <TouchableOpacity
                              key={phase.key}
                              onPress={() => handlePhaseChangeRequest(phase.key)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                backgroundColor: isSelected ? `${phase.color}10` : 'transparent',
                                borderBottomWidth: phase.key !== PROJECT_PHASES[PROJECT_PHASES.length - 1].key ? 1 : 0,
                                borderBottomColor: '#f0f0f0',
                              }}
                              activeOpacity={0.7}
                            >
                              <View
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 4,
                                  backgroundColor: phase.color,
                                  marginRight: 8,
                                }}
                              />
                              <Ionicons
                                name={phase.icon}
                                size={14}
                                color={phase.color}
                                style={{ marginRight: 8 }}
                              />
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: isSelected ? '700' : '500',
                                  color: isSelected ? phase.color : '#333',
                                  flex: 1,
                                }}
                              >
                                {phase.name}
                              </Text>
                              {isSelected && (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={14}
                                  color={phase.color}
                                />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </div>
                    )}
                    </div>
                    
                    {/* Home and Refresh buttons */}
                    <TouchableOpacity
                      onPress={() => {
                        setSpinHome(n => n + 1);
                        handleGoHome();
                      }}
                      style={{ padding: 6, borderRadius: 6, backgroundColor: 'transparent' }}
                      accessibilityLabel="Hem"
                    >
                      <Ionicons
                        name="home-outline"
                        size={18}
                        color={currentPhase.color}
                        style={{
                          transform: `rotate(${spinHome * 360}deg)`,
                          transition: 'transform 0.4s ease'
                        }}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setSpinRefresh(n => n + 1);
                        handleRefresh();
                      }}
                      style={{ padding: 6, borderRadius: 6, backgroundColor: 'transparent' }}
                      accessibilityLabel="Uppdatera"
                    >
                      <Ionicons
                        name="refresh"
                        size={18}
                        color={currentPhase.color}
                        style={{
                          transform: `rotate(${spinRefresh * 360}deg)`,
                          transition: 'transform 0.4s ease'
                        }}
                      />
                    </TouchableOpacity>
                  </>
                );
              })()}
            </div>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {(() => {
                const currentPhase = PROJECT_PHASES.find(p => p.key === currentPhaseKey) || PROJECT_PHASES[0];
                return (
                  <>
                    {/* Phase Dropdown */}
                    <View style={{ position: 'relative', flex: 1 }}>
                      <TouchableOpacity
                        onPress={() => setPhaseDropdownOpen(!phaseDropdownOpen)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 6,
                          backgroundColor: `${currentPhase.color}15`,
                          borderWidth: 2,
                          borderColor: currentPhase.color,
                        }}
                        activeOpacity={0.7}
                      >
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: currentPhase.color,
                            marginRight: 8,
                          }}
                        />
                        <Ionicons
                          name={currentPhase.icon}
                          size={16}
                          color={currentPhase.color}
                          style={{ marginRight: 8 }}
                        />
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '700',
                            color: currentPhase.color,
                            flex: 1,
                          }}
                        >
                          {currentPhase.name}
                        </Text>
                        <Ionicons
                          name={phaseDropdownOpen ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={currentPhase.color}
                        />
                      </TouchableOpacity>
                      
                      {phaseDropdownOpen && (
                        <View
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            marginTop: 4,
                            backgroundColor: '#fff',
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: '#e0e0e0',
                            elevation: 5,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.25,
                            shadowRadius: 3.84,
                            overflow: 'hidden',
                          }}
                        >
                          {PROJECT_PHASES.map(phase => {
                            const isSelected = currentPhaseKey === phase.key;
                            return (
                              <TouchableOpacity
                                key={phase.key}
                                onPress={() => handlePhaseChangeRequest(phase.key)}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  paddingVertical: 8,
                                  paddingHorizontal: 10,
                                  backgroundColor: isSelected ? `${phase.color}10` : 'transparent',
                                  borderBottomWidth: phase.key !== PROJECT_PHASES[PROJECT_PHASES.length - 1].key ? 1 : 0,
                                  borderBottomColor: '#f0f0f0',
                                }}
                                activeOpacity={0.7}
                              >
                                <View
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 4,
                                    backgroundColor: phase.color,
                                    marginRight: 8,
                                  }}
                                />
                                <Ionicons
                                  name={phase.icon}
                                  size={14}
                                  color={phase.color}
                                  style={{ marginRight: 8 }}
                                />
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: isSelected ? '700' : '500',
                                    color: isSelected ? phase.color : '#333',
                                    flex: 1,
                                  }}
                                >
                                  {phase.name}
                                </Text>
                                {isSelected && (
                                  <Ionicons
                                    name="checkmark-circle"
                                    size={14}
                                    color={phase.color}
                                  />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                    
                    {/* Home and Refresh buttons */}
                    <TouchableOpacity
                      onPress={() => {
                        setSpinHome(n => n + 1);
                        handleGoHome();
                      }}
                      style={{ padding: 6, borderRadius: 6, backgroundColor: 'transparent' }}
                      accessibilityLabel="Hem"
                    >
                      <Ionicons
                        name="home-outline"
                        size={18}
                        color={currentPhase.color}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setSpinRefresh(n => n + 1);
                        handleRefresh();
                      }}
                      style={{ padding: 6, borderRadius: 6, backgroundColor: 'transparent' }}
                      accessibilityLabel="Uppdatera"
                    >
                      <Ionicons
                        name="refresh"
                        size={18}
                        color={currentPhase.color}
                      />
                    </TouchableOpacity>
                  </>
                );
              })()}
            </View>
          )}
        </View>
      )}

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
    height: '100%',
    width: '100%'
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
