/**
 * Phase Left Panel - Navigation panel for kalkylskede
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState, useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, Platform } from 'react-native';
import { auth } from '../../../../../components/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addSection, removeSection, addItem, removeItem } from '../services/navigationService';
import { getAppVersion } from '../../../../../utils/appVersion';

const appVersion = getAppVersion();

export default function PhaseLeftPanel({
  navigation,
  activeSection,
  activeItem,
  onSelectSection,
  onSelectItem,
  projectName,
  companyId,
  loadNavigation,
  saveNavigation
}) {
  const [canEdit, setCanEdit] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedNestedItems, setExpandedNestedItems] = useState({});
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [targetSectionIdForItem, setTargetSectionIdForItem] = useState(null);
  const [targetParentItemIdForItem, setTargetParentItemIdForItem] = useState(null);
  const [saving, setSaving] = useState(false);

  // Check permissions - allow all company members to edit navigation
  useEffect(() => {
    if (Platform.OS !== 'web' || !companyId) {
      setCanEdit(false);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        const isEmailSuperadmin = email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.com' || email === 'marcus.skogh@msbyggsystem';
        
        if (isEmailSuperadmin) {
          if (mounted) setCanEdit(true);
          return;
        }

        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null); } catch(_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const currentCompanyId = companyFromClaims || stored || '';
        
        // Any company member can edit navigation
        console.log('[PhaseLeftPanel] Permission check - currentCompanyId:', currentCompanyId, 'companyId:', companyId, 'match:', currentCompanyId === companyId);
        if (mounted && currentCompanyId && companyId && currentCompanyId === companyId) {
          setCanEdit(true);
        } else if (mounted) {
          setCanEdit(false);
        }
      } catch(_e) {
        console.error('[PhaseLeftPanel] Error checking permissions:', _e);
        if (mounted) setCanEdit(false);
      }
    })();
    
    return () => { mounted = false; };
  }, [companyId]);

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const handleAddSection = async () => {
    if (!newSectionName.trim() || !companyId || !loadNavigation) return;
    
    setSaving(true);
    try {
      const success = await addSection(companyId, null, 'kalkylskede', {
        name: newSectionName.trim(),
        icon: 'folder-outline'
      });
      
      if (success) {
        setNewSectionName('');
        setShowAddSectionModal(false);
        if (loadNavigation) {
          await loadNavigation();
        }
      } else {
        Alert.alert('Fel', 'Kunde inte lägga till sektion');
      }
    } catch (error) {
      console.error('[PhaseLeftPanel] Error adding section:', error);
      Alert.alert('Fel', `Kunde inte lägga till sektion: ${error.message || 'Okänt fel'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSection = async (sectionId) => {
    if (!companyId || !loadNavigation) return;
    
    Alert.alert(
      'Ta bort sektion',
      'Är du säker på att du vill ta bort denna sektion?',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const success = await removeSection(companyId, null, 'kalkylskede', sectionId);
              if (success) {
                if (loadNavigation) {
                  await loadNavigation();
                }
              } else {
                Alert.alert('Fel', 'Kunde inte ta bort sektion');
              }
            } catch (error) {
              console.error('[PhaseLeftPanel] Error removing section:', error);
              Alert.alert('Fel', `Kunde inte ta bort sektion: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  const handleAddItem = async () => {
    if (!newItemName.trim() || !companyId || !targetSectionIdForItem || !loadNavigation) return;
    
    setSaving(true);
    try {
      const success = await addItem(
        companyId,
        null,
        'kalkylskede',
        targetSectionIdForItem,
        { name: newItemName.trim() },
        targetParentItemIdForItem
      );
      
      if (success) {
        setNewItemName('');
        setTargetSectionIdForItem(null);
        setTargetParentItemIdForItem(null);
        setShowAddItemModal(false);
        if (loadNavigation) {
          await loadNavigation();
        }
      } else {
        Alert.alert('Fel', 'Kunde inte lägga till item');
      }
    } catch (error) {
      console.error('[PhaseLeftPanel] Error adding item:', error);
      Alert.alert('Fel', `Kunde inte lägga till item: ${error.message || 'Okänt fel'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (sectionId, itemId, parentItemId = null) => {
    if (!companyId || !loadNavigation) return;
    
    Alert.alert(
      'Ta bort item',
      'Är du säker på att du vill ta bort detta item?',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const success = await removeItem(companyId, null, 'kalkylskede', sectionId, itemId, parentItemId);
              if (success) {
                if (loadNavigation) {
                  await loadNavigation();
                }
              } else {
                Alert.alert('Fel', 'Kunde inte ta bort item');
              }
            } catch (error) {
              console.error('[PhaseLeftPanel] Error removing item:', error);
              Alert.alert('Fel', `Kunde inte ta bort item: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  // Debug logging
  React.useEffect(() => {
    console.log('[PhaseLeftPanel] Render - navigation:', !!navigation, 'sections:', navigation?.sections?.length || 0, 'projectName:', projectName);
  }, [navigation, projectName]);

  if (!navigation || !navigation.sections) {
    console.log('[PhaseLeftPanel] No navigation or sections available');
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Ingen navigation tillgänglig</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Project name header */}
      {projectName && (
        <View style={styles.projectHeader}>
          <Text style={styles.projectName} numberOfLines={1}>
            {projectName}
          </Text>
          <View style={styles.divider} />
        </View>
      )}

      {/* Content wrapper - takes flex: 1, status box will be pushed to bottom with marginTop: auto */}
      <View style={styles.contentWrapper}>
        {Platform.OS === 'web' ? (
          <View style={styles.scrollViewContainer}>
            <View style={styles.scrollViewContent}>
        {navigation.sections.map(section => {
          // All sections start collapsed (expanded: false)
          const isExpanded = expandedSections[section.id] ?? false;
          // Only show as active if section is expanded AND matches activeSection
          const isActive = isExpanded && activeSection === section.id;
          const hasItems = section.items && section.items.length > 0;

          return (
            <View key={section.id} style={styles.sectionContainer}>
              {/* Section header */}
              <TouchableOpacity
                style={[styles.sectionHeader, isActive && styles.sectionHeaderActive]}
                onPress={() => {
                  const willBeExpanded = !expandedSections[section.id];
                  // Always allow toggling, even if no items
                  toggleSection(section.id);
                  
                  if (willBeExpanded) {
                    // Opening section - set as active
                    if (onSelectSection) {
                      onSelectSection(section.id);
                      // Clear active item when selecting section to show summary
                      if (onSelectItem) {
                        onSelectItem(section.id, null);
                      }
                    }
                  } else {
                    // Closing section - clear active if this was the active section
                    if (activeSection === section.id && onSelectSection) {
                      onSelectSection(null);
                      if (onSelectItem) {
                        onSelectItem(null, null);
                      }
                    }
                  }
                }}
              >
                {/* Always show chevron for all sections */}
                <Ionicons
                  name={isExpanded ? 'chevron-down-outline' : 'chevron-forward-outline'}
                  size={14}
                  color="#666"
                  style={styles.chevron}
                />
                <Ionicons
                  name={section.icon || 'folder-outline'}
                  size={16}
                  color={isActive ? '#1976D2' : '#666'}
                  style={styles.sectionIcon}
                />
                <Text style={[styles.sectionName, isActive && styles.sectionNameActive]}>
                  {section.name}
                </Text>
                {canEdit && (
                  <View style={{ flexDirection: 'row', marginLeft: 8, gap: 4 }}>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        setTargetSectionIdForItem(section.id);
                        setTargetParentItemIdForItem(null);
                        setNewItemName('');
                        setShowAddItemModal(true);
                      }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="add-circle-outline" size={18} color="#1976D2" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleRemoveSection(section.id);
                      }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#D32F2F" />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>

              {/* Section items */}
              {isExpanded && hasItems && (
                <View style={styles.itemsContainer}>
                  {section.items.map(item => {
                    const hasNestedItems = item.type === 'nested' && item.items && item.items.length > 0;
                    const nestedKey = hasNestedItems ? `${section.id}.${item.id}` : null;
                    const isNestedExpanded = nestedKey ? expandedNestedItems[nestedKey] : false;
                    // Only show as active if nested items are expanded AND item matches activeItem
                    const isItemActive = hasNestedItems 
                      ? (isNestedExpanded && activeSection === section.id && activeItem === item.id)
                      : (activeSection === section.id && activeItem === item.id);

                    return (
                      <View key={item.id}>
                        {/* Item */}
                        <TouchableOpacity
                          style={[styles.item, isItemActive && styles.itemActive]}
                          onPress={() => {
                            if (hasNestedItems) {
                              const willBeExpanded = !expandedNestedItems[nestedKey];
                              setExpandedNestedItems(prev => ({
                                ...prev,
                                [nestedKey]: !prev[nestedKey]
                              }));
                              
                              if (willBeExpanded) {
                                // Opening nested items - set as active
                                if (onSelectItem) {
                                  onSelectItem(section.id, item.id);
                                }
                              } else {
                                // Closing nested items - clear active if this was the active item
                                if (activeSection === section.id && activeItem === item.id && onSelectItem) {
                                  onSelectItem(section.id, null);
                                }
                              }
                            } else {
                              // Item without nested items - just select it
                              console.log('[PhaseLeftPanel] Clicking item:', item.id, 'in section:', section.id);
                              
                              // Ensure section is expanded when clicking an item
                              if (!expandedSections[section.id]) {
                                toggleSection(section.id);
                              }
                              
                              if (onSelectItem) {
                                onSelectItem(section.id, item.id);
                              } else {
                                console.warn('[PhaseLeftPanel] onSelectItem is not defined!');
                              }
                            }
                          }}
                        >
                          <Text style={[styles.itemText, isItemActive && styles.itemTextActive]}>
                            • {item.name}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {canEdit && (
                              <>
                                {hasNestedItems && (
                                  <TouchableOpacity
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      setTargetSectionIdForItem(section.id);
                                      setTargetParentItemIdForItem(item.id);
                                      setNewItemName('');
                                      setShowAddItemModal(true);
                                    }}
                                    style={{ padding: 2 }}
                                  >
                                    <Ionicons name="add-circle-outline" size={16} color="#1976D2" />
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleRemoveItem(section.id, item.id);
                                  }}
                                  style={{ padding: 2 }}
                                >
                                  <Ionicons name="close-circle-outline" size={16} color="#D32F2F" />
                                </TouchableOpacity>
                              </>
                            )}
                            {hasNestedItems && (
                              <Ionicons
                                name={expandedNestedItems[`${section.id}.${item.id}`] ? 'chevron-down-outline' : 'chevron-forward-outline'}
                                size={14}
                                color="#999"
                              />
                            )}
                          </View>
                        </TouchableOpacity>

                        {/* Nested items (e.g., under Ritningar) */}
                        {hasNestedItems && expandedNestedItems[`${section.id}.${item.id}`] && (
                          <View style={styles.nestedItemsContainer}>
                            {item.items.map(subItem => {
                              const isSubItemActive =
                                activeSection === section.id &&
                                activeItem === `${item.id}.${subItem.id}`;

                              return (
                                <TouchableOpacity
                                  key={subItem.id}
                                  style={[styles.nestedItem, isSubItemActive && styles.nestedItemActive]}
                                  onPress={() => {
                                    if (onSelectItem) {
                                      onSelectItem(section.id, `${item.id}.${subItem.id}`);
                                    }
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.nestedItemText,
                                      isSubItemActive && styles.nestedItemTextActive
                                    ]}
                                  >
                                    – {subItem.name}
                                  </Text>
                                  {canEdit && (
                                    <TouchableOpacity
                                      onPress={(e) => {
                                        e.stopPropagation();
                                        handleRemoveItem(section.id, subItem.id, item.id);
                                      }}
                                      style={{ padding: 2, marginLeft: 4 }}
                                    >
                                      <Ionicons name="close-circle-outline" size={14} color="#D32F2F" />
                                    </TouchableOpacity>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Section without items (like Möten) - show empty state when expanded */}
              {!hasItems && isExpanded && (
                <View style={styles.itemsContainer}>
                  <View style={styles.emptySectionContainer}>
                    <Text style={styles.emptySectionText}>
                      Inga items i denna sektion ännu
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}
        
        {/* Add section button */}
        {canEdit && (
          <TouchableOpacity
            style={styles.addSectionButton}
            onPress={() => {
              setNewSectionName('');
              setShowAddSectionModal(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#1976D2" />
            <Text style={styles.addSectionButtonText}>Lägg till sektion</Text>
          </TouchableOpacity>
        )}
            </View>
          </View>
        ) : (
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollViewContent}
            showsVerticalScrollIndicator={true}
          >
          {navigation.sections.map(section => {
            const isExpanded = expandedSections[section.id] ?? false;
            const isActive = isExpanded && activeSection === section.id;
            const hasItems = section.items && section.items.length > 0;

            return (
              <View key={section.id} style={styles.sectionContainer}>
                <TouchableOpacity
                  style={[styles.sectionHeader, isActive && styles.sectionHeaderActive]}
                  onPress={() => {
                    const willBeExpanded = !expandedSections[section.id];
                    toggleSection(section.id);
                    if (willBeExpanded) {
                      if (onSelectSection) {
                        onSelectSection(section.id);
                        if (onSelectItem) onSelectItem(section.id, null);
                      }
                    } else {
                      if (activeSection === section.id && onSelectSection) {
                        onSelectSection(null);
                        if (onSelectItem) onSelectItem(null, null);
                      }
                    }
                  }}
                >
                  <Ionicons
                    name={isExpanded ? 'chevron-down-outline' : 'chevron-forward-outline'}
                    size={16}
                    color="#666"
                    style={styles.chevron}
                  />
                  <Ionicons
                    name={section.icon || 'folder-outline'}
                    size={18}
                    color={isActive ? '#1976D2' : '#666'}
                    style={styles.sectionIcon}
                  />
                  <Text style={[styles.sectionName, isActive && styles.sectionNameActive]}>
                    {section.name}
                  </Text>
                  {canEdit && (
                    <View style={{ flexDirection: 'row', marginLeft: 8, gap: 4 }}>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setTargetSectionIdForItem(section.id);
                          setTargetParentItemIdForItem(null);
                          setNewItemName('');
                          setShowAddItemModal(true);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#1976D2" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleRemoveSection(section.id);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="close-circle-outline" size={18} color="#D32F2F" />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>

                {isExpanded && hasItems && (
                  <View style={styles.itemsContainer}>
                    {section.items.map(item => {
                      const hasNestedItems = item.type === 'nested' && item.items && item.items.length > 0;
                      const nestedKey = hasNestedItems ? `${section.id}.${item.id}` : null;
                      const isNestedExpanded = nestedKey ? expandedNestedItems[nestedKey] : false;
                      const isItemActive = hasNestedItems 
                        ? (isNestedExpanded && activeSection === section.id && activeItem === item.id)
                        : (activeSection === section.id && activeItem === item.id);

                      return (
                        <View key={item.id}>
                          <TouchableOpacity
                            style={[styles.item, isItemActive && styles.itemActive]}
                            onPress={() => {
                              if (hasNestedItems) {
                                const willBeExpanded = !expandedNestedItems[nestedKey];
                                setExpandedNestedItems(prev => ({
                                  ...prev,
                                  [nestedKey]: !prev[nestedKey]
                                }));
                                if (willBeExpanded) {
                                  if (onSelectItem) onSelectItem(section.id, item.id);
                                } else {
                                  if (activeSection === section.id && activeItem === item.id && onSelectItem) {
                                    onSelectItem(section.id, null);
                                  }
                                }
                              } else {
                                if (!expandedSections[section.id]) toggleSection(section.id);
                                if (onSelectItem) onSelectItem(section.id, item.id);
                              }
                            }}
                          >
                            <Text style={[styles.itemText, isItemActive && styles.itemTextActive]}>
                              • {item.name}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              {canEdit && (
                                <>
                                  {hasNestedItems && (
                                    <TouchableOpacity
                                      onPress={(e) => {
                                        e.stopPropagation();
                                        setTargetSectionIdForItem(section.id);
                                        setTargetParentItemIdForItem(item.id);
                                        setNewItemName('');
                                        setShowAddItemModal(true);
                                      }}
                                      style={{ padding: 2 }}
                                    >
                                      <Ionicons name="add-circle-outline" size={16} color="#1976D2" />
                                    </TouchableOpacity>
                                  )}
                                  <TouchableOpacity
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleRemoveItem(section.id, item.id);
                                    }}
                                    style={{ padding: 2 }}
                                  >
                                    <Ionicons name="close-circle-outline" size={14} color="#D32F2F" />
                                  </TouchableOpacity>
                                </>
                              )}
                              {hasNestedItems && (
                                <Ionicons
                                  name={expandedNestedItems[`${section.id}.${item.id}`] ? 'chevron-down-outline' : 'chevron-forward-outline'}
                                  size={14}
                                  color="#999"
                                />
                              )}
                            </View>
                          </TouchableOpacity>

                          {hasNestedItems && expandedNestedItems[`${section.id}.${item.id}`] && (
                            <View style={styles.nestedItemsContainer}>
                              {item.items.map(subItem => {
                                const isSubItemActive = activeSection === section.id && activeItem === `${item.id}.${subItem.id}`;
                                return (
                                  <TouchableOpacity
                                    key={subItem.id}
                                    style={[styles.nestedItem, isSubItemActive && styles.nestedItemActive]}
                                    onPress={() => {
                                      if (onSelectItem) onSelectItem(section.id, `${item.id}.${subItem.id}`);
                                    }}
                                  >
                                    <Text style={[styles.nestedItemText, isSubItemActive && styles.nestedItemTextActive]}>
                                      – {subItem.name}
                                    </Text>
                                    {canEdit && (
                                      <TouchableOpacity
                                        onPress={(e) => {
                                          e.stopPropagation();
                                          handleRemoveItem(section.id, subItem.id, item.id);
                                        }}
                                        style={{ padding: 2, marginLeft: 4 }}
                                      >
                                        <Ionicons name="close-circle-outline" size={14} color="#D32F2F" />
                                      </TouchableOpacity>
                                    )}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {!hasItems && isExpanded && (
                  <View style={styles.itemsContainer}>
                    <View style={styles.emptySectionContainer}>
                      <Text style={styles.emptySectionText}>Inga items i denna sektion ännu</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        
          {canEdit && (
            <TouchableOpacity
              style={styles.addSectionButton}
              onPress={() => {
                setNewSectionName('');
                setShowAddSectionModal(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#1976D2" />
              <Text style={styles.addSectionButtonText}>Lägg till sektion</Text>
            </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {/* Status Box at bottom - fixed position */}
        <View style={styles.statusBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 11, color: '#2E7D32', fontWeight: '600' }}>
              Synk: synced
            </Text>
            <Text style={{ fontSize: 11, color: '#666' }}>
              Version: {appVersion}
            </Text>
          </View>
        </View>
      </View>

      {/* Add Section Modal */}
      <Modal
        visible={showAddSectionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !saving && setShowAddSectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Lägg till sektion</Text>
            <TextInput
              value={newSectionName}
              onChangeText={setNewSectionName}
              placeholder="Sektionsnamn"
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowAddSectionModal(false)}
                disabled={saving}
              >
                <Text style={styles.modalButtonTextCancel}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleAddSection}
                disabled={saving || !newSectionName.trim()}
              >
                <Text style={styles.modalButtonTextSave}>Lägg till</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Item Modal */}
      <Modal
        visible={showAddItemModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !saving && setShowAddItemModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {targetParentItemIdForItem ? 'Lägg till undermapp' : 'Lägg till item'}
            </Text>
            <TextInput
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder={targetParentItemIdForItem ? 'Undermappsnamn' : 'Itemnamn'}
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowAddItemModal(false)}
                disabled={saving}
              >
                <Text style={styles.modalButtonTextCancel}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleAddItem}
                disabled={saving || !newItemName.trim()}
              >
                <Text style={styles.modalButtonTextSave}>Lägg till</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, // Take full available space in parent
    flexDirection: 'column', // Ensure column layout
    backgroundColor: '#f5f6f7',
    borderRightWidth: 1,
    borderRightColor: '#e6e6e6',
    height: '100%', // Use parent height
    ...(Platform.OS === 'web' ? {
      maxHeight: '100%', // Constrain to parent
      overflow: 'hidden',
      display: 'flex', // Ensure flex layout
    } : {})
  },
  projectHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e6e6e6',
    backgroundColor: '#fff',
    flexShrink: 0, // Prevent header from shrinking
  },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8
  },
  divider: {
    height: 1,
    backgroundColor: '#e6e6e6'
  },
  contentWrapper: {
    flex: 1, // Take remaining space (after header)
    minHeight: 0, // Allow shrinking
    flexDirection: 'column', // Column layout for scroll area + status box
    ...(Platform.OS === 'web' ? {
      overflow: 'hidden', // Prevent wrapper from growing
      display: 'flex', // Ensure flex layout
    } : {})
  },
  scrollViewContainer: {
    flex: 1, // Take remaining space (everything except header and status box)
    minHeight: 0, // Critical: Allow shrinking below content size
    maxHeight: '100%', // Prevent growing beyond wrapper
    overflow: 'auto', // Scroll when content exceeds available space
    WebkitOverflowScrolling: 'touch',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    // Content container for both web and native
    paddingBottom: 8, // Small padding at bottom
  },
  statusBox: {
    marginTop: 'auto', // Push to bottom - this is the key!
    width: '100%',
    alignSelf: 'stretch', // Ensure full width
    backgroundColor: '#f4f6f8', // Light gray background like ChatGPT example
    borderTopWidth: 1,
    borderTopColor: '#e3e6ea', // Slightly lighter border
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 40,
    flexShrink: 0, // Prevent shrinking - keep it fixed size
    flexGrow: 0, // Don't grow - keep it fixed size
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 -2px 8px rgba(0,0,0,0.05)', // Subtle shadow for separation
    } : {
      elevation: 3, // For Android
    })
  },
  sectionContainer: {
    marginBottom: 2
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: 'transparent'
  },
  sectionHeaderActive: {
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2'
  },
  chevron: {
    marginRight: 8
  },
  sectionIcon: {
    marginRight: 8
  },
  sectionName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#222',
    flex: 1
  },
  sectionNameActive: {
    color: '#1976D2'
  },
  itemsContainer: {
    backgroundColor: '#fafafa',
    paddingLeft: 16
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 16,
    paddingLeft: 24
  },
  itemActive: {
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 3,
    borderLeftColor: '#1976D2'
  },
  itemText: {
    fontSize: 12,
    color: '#444',
    flex: 1
  },
  itemTextActive: {
    color: '#1976D2',
    fontWeight: '600'
  },
  nestedItemsContainer: {
    paddingLeft: 16,
    backgroundColor: '#f5f5f5'
  },
  nestedItem: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    paddingLeft: 32
  },
  nestedItemActive: {
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 3,
    borderLeftColor: '#1976D2'
  },
  nestedItemText: {
    fontSize: 11,
    color: '#666'
  },
  nestedItemTextActive: {
    color: '#1976D2',
    fontWeight: '600'
  },
  emptyText: {
    padding: 20,
    textAlign: 'center',
    color: '#999'
  },
  emptySectionContainer: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptySectionText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic'
  },
  addSectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
    marginHorizontal: 16,
    gap: 8
  },
  addSectionButtonText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 12
    })
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    marginBottom: 16
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#fff'
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center'
  },
  modalButtonCancel: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },
  modalButtonSave: {
    backgroundColor: '#1976D2'
  },
  modalButtonTextCancel: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14
  },
  modalButtonTextSave: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14
  }
});
