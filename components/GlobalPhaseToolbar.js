/**
 * GlobalPhaseToolbar - Global sticky toolbar with phase selector, home, and refresh buttons
 * This toolbar is always visible at the top of the app, regardless of current view
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform, Alert, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PROJECT_PHASES, DEFAULT_PHASE } from '../features/projects/constants';

const dispatchWindowEvent = (name, detail) => {
  try {
    if (typeof window === 'undefined') return;
    const evt = (typeof CustomEvent === 'function')
      ? new CustomEvent(name, { detail })
      : (() => {
        const e = document.createEvent('Event');
        e.initEvent(name, true, true);
        e.detail = detail;
        return e;
      })();
    window.dispatchEvent(evt);
  } catch (_e) {}
};

const listenToWindowEvent = (name, handler) => {
  try {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(name, handler);
    return () => {
      try { window.removeEventListener(name, handler); } catch (_e) {}
    };
  } catch (_e) {
    return () => {};
  }
};

export default function GlobalPhaseToolbar({ navigation, route }) {
  const [selectedPhase, setSelectedPhase] = useState(DEFAULT_PHASE);
  const [phaseDropdownOpen, setPhaseDropdownOpen] = useState(false);
  const [changingPhase, setChangingPhase] = useState(false);
  const [pendingPhaseChange, setPendingPhaseChange] = useState(null);
  const [spinHome, setSpinHome] = useState(0);
  const [spinRefresh, setSpinRefresh] = useState(0);

  // Listen for phase changes from HomeScreen
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handlePhaseUpdate = (event) => {
      try {
        const detail = event?.detail || {};
        const phase = detail.phase;
        if (phase && PROJECT_PHASES.some(p => p.key === phase)) {
          setSelectedPhase(phase);
        }
      } catch (_e) {}
    };

    return listenToWindowEvent('dkPhaseUpdate', handlePhaseUpdate);
  }, []);

  // Close dropdown when clicking outside (web only)
  useEffect(() => {
    if (!phaseDropdownOpen || Platform.OS !== 'web') return;
    
    const handleClickOutside = (event) => {
      const target = event.target;
      try {
        const dropdownElement = document.querySelector('[data-global-phase-dropdown]');
        if (dropdownElement && !dropdownElement.contains(target)) {
          // Also check if click is on the dropdown content itself
          const dropdownContent = dropdownElement.querySelector('[data-global-phase-dropdown-content]');
          if (!dropdownContent || !dropdownContent.contains(target)) {
            setPhaseDropdownOpen(false);
          }
        }
      } catch (e) {
        // Ignore errors
      }
    };
    
    // Use a small delay to avoid closing immediately when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [phaseDropdownOpen]);

  // Request phase change - shows confirmation dialog
  const handlePhaseChangeRequest = (newPhaseKey) => {
    if (newPhaseKey === selectedPhase) {
      setPhaseDropdownOpen(false);
      return;
    }

    const newPhase = PROJECT_PHASES.find(p => p.key === newPhaseKey);
    if (!newPhase) return;

    setPendingPhaseChange(newPhaseKey);
    setPhaseDropdownOpen(false);

    // Show confirmation dialog
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Du är på väg att byta till fasen "${newPhase.name}".\n\nPågående ändringar sparas automatiskt.\n\nVill du fortsätta?`
      );
      if (confirmed) {
        proceedWithPhaseChange(newPhaseKey);
      } else {
        setPendingPhaseChange(null);
      }
    } else {
      Alert.alert(
        'Byt fas',
        `Du är på väg att byta till fasen "${newPhase.name}".\n\nPågående ändringar sparas automatiskt.\n\nVill du fortsätta?`,
        [
          { text: 'Avbryt', style: 'cancel', onPress: () => setPendingPhaseChange(null) },
          { text: 'Fortsätt', onPress: () => proceedWithPhaseChange(newPhaseKey) },
        ]
      );
    }
  };

  // Proceed with phase change after confirmation
  const proceedWithPhaseChange = async (newPhaseKey) => {
    setChangingPhase(true);
    setPendingPhaseChange(null);

    try {
      // Emit phase change event for HomeScreen to handle
      dispatchWindowEvent('dkPhaseChange', { phase: newPhaseKey });
      
      // Update local state
      setSelectedPhase(newPhaseKey);
      
      // Small delay to show loading indicator
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('[GlobalPhaseToolbar] Error changing phase:', error);
    } finally {
      setChangingPhase(false);
    }
  };

  // Handle home button
  const handleGoHome = () => {
    setSpinHome(n => n + 1);
    try {
      if (navigation?.reset) {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      } else {
        navigation?.navigate?.('Home');
      }
      // Also dispatch event for HomeScreen
      dispatchWindowEvent('dkGoHome', {});
    } catch (_e) {
      // Fallback: try to navigate
      try { navigation?.navigate?.('Home'); } catch (__e) {}
    }
  };

  // Handle refresh button
  const handleRefresh = () => {
    setSpinRefresh(n => n + 1);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        // Dispatch refresh event for components to handle
        dispatchWindowEvent('dkRefresh', {});
        // Also do a hard refresh as fallback
        setTimeout(() => {
          try { window.location.reload(); } catch (_e) {}
        }, 100);
      } catch (_e) {}
    }
  };

  const currentPhaseConfig = PROJECT_PHASES.find(p => p.key === selectedPhase) || PROJECT_PHASES[0];

  if (Platform.OS === 'web') {
    return (
      <>
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 48,
            backgroundColor: '#fff',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 20,
            paddingRight: 20,
            gap: 12,
            zIndex: 1000,
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          }}
        >
          {/* Phase Dropdown - to the left of home button */}
          <div 
            style={{ position: 'relative', flex: 1, maxWidth: 200, zIndex: phaseDropdownOpen ? 10000 : 'auto' }} 
            data-global-phase-dropdown
            onClick={(e) => e.stopPropagation()}
          >
            <TouchableOpacity
              onPress={() => setPhaseDropdownOpen(!phaseDropdownOpen)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 6,
                backgroundColor: `${currentPhaseConfig.color}15`,
                borderWidth: 2,
                borderColor: currentPhaseConfig.color,
                cursor: 'pointer',
              }}
              activeOpacity={0.7}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: currentPhaseConfig.color,
                  marginRight: 8,
                }}
              />
              <Ionicons
                name={currentPhaseConfig.icon}
                size={16}
                color={currentPhaseConfig.color}
                style={{ marginRight: 8 }}
              />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: currentPhaseConfig.color,
                  flex: 1,
                }}
              >
                {currentPhaseConfig.name}
              </Text>
              <Ionicons
                name={phaseDropdownOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color={currentPhaseConfig.color}
              />
            </TouchableOpacity>
            
            {/* Dropdown menu */}
            {phaseDropdownOpen && (
              <div
                data-global-phase-dropdown-content
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 4,
                  backgroundColor: '#fff',
                  borderRadius: 6,
                  border: '1px solid #e0e0e0',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  zIndex: 10001,
                  overflow: 'hidden',
                  pointerEvents: 'auto',
                }}
              >
                {PROJECT_PHASES.map(phase => {
                  const isSelected = selectedPhase === phase.key;
                  return (
                    <button
                      key={phase.key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handlePhaseChangeRequest(phase.key);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: '8px 10px',
                        backgroundColor: isSelected ? `${phase.color}10` : 'transparent',
                        border: 'none',
                        borderBottom: phase.key !== PROJECT_PHASES[PROJECT_PHASES.length - 1].key ? '1px solid #f0f0f0' : 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        fontSize: '13px',
                        fontWeight: isSelected ? '700' : '500',
                        color: isSelected ? phase.color : '#333',
                        transition: 'background-color 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = '#f5f5f5';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: phase.color,
                          marginRight: 8,
                          flexShrink: 0,
                        }}
                      />
                      <Ionicons
                        name={phase.icon}
                        size={14}
                        color={phase.color}
                        style={{ marginRight: 8, flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: isSelected ? '700' : '500',
                          color: isSelected ? phase.color : '#333',
                          flex: 1,
                        }}
                      >
                        {phase.name}
                      </span>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color={phase.color}
                          style={{ flexShrink: 0 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Home button */}
          <TouchableOpacity
            onPress={handleGoHome}
            style={{ padding: 6, borderRadius: 6, backgroundColor: 'transparent' }}
            accessibilityLabel="Hem"
          >
            <Ionicons
              name="home-outline"
              size={18}
              color={currentPhaseConfig.color}
              style={{
                transform: `rotate(${spinHome * 360}deg)`,
                transition: 'transform 0.4s ease'
              }}
            />
          </TouchableOpacity>

          {/* Refresh button */}
          <TouchableOpacity
            onPress={handleRefresh}
            style={{ padding: 6, borderRadius: 6, backgroundColor: 'transparent' }}
            accessibilityLabel="Uppdatera"
          >
            <Ionicons
              name="refresh"
              size={18}
              color={currentPhaseConfig.color}
              style={{
                transform: `rotate(${spinRefresh * 360}deg)`,
                transition: 'transform 0.4s ease'
              }}
            />
          </TouchableOpacity>
        </div>
        
        {/* Loading modal for phase change */}
        {changingPhase && (
          <Modal
            transparent={true}
            animationType="fade"
            visible={changingPhase}
            onRequestClose={() => {}}
          >
            <View style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 8,
                padding: 24,
                alignItems: 'center',
                minWidth: 200,
              }}>
                <ActivityIndicator size="large" color={currentPhaseConfig.color} />
                <Text style={{ marginTop: 16, fontSize: 16, color: '#222' }}>
                  Byter fas...
                </Text>
              </View>
            </View>
          </Modal>
        )}
      </>
    );
  }

  // Native rendering
  return (
    <View
      style={{
        height: 48,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 12,
      }}
    >
      {/* Phase Dropdown */}
      <View style={{ flex: 1, maxWidth: 200 }}>
        <TouchableOpacity
          onPress={() => setPhaseDropdownOpen(!phaseDropdownOpen)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 6,
            backgroundColor: `${currentPhaseConfig.color}15`,
            borderWidth: 2,
            borderColor: currentPhaseConfig.color,
          }}
          activeOpacity={0.7}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: currentPhaseConfig.color,
              marginRight: 8,
            }}
          />
          <Ionicons
            name={currentPhaseConfig.icon}
            size={16}
            color={currentPhaseConfig.color}
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: currentPhaseConfig.color,
              flex: 1,
            }}
          >
            {currentPhaseConfig.name}
          </Text>
          <Ionicons
            name={phaseDropdownOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color={currentPhaseConfig.color}
          />
        </TouchableOpacity>
      </View>
      
      {/* Home and Refresh buttons */}
      <TouchableOpacity
        onPress={handleGoHome}
        style={{ padding: 6, borderRadius: 6 }}
        accessibilityLabel="Hem"
      >
        <Ionicons
          name="home-outline"
          size={18}
          color={currentPhaseConfig.color}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleRefresh}
        style={{ padding: 6, borderRadius: 6 }}
        accessibilityLabel="Uppdatera"
      >
        <Ionicons
          name="refresh"
          size={18}
          color={currentPhaseConfig.color}
        />
      </TouchableOpacity>
    </View>
  );
}
