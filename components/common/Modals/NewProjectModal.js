/**
 * NewProjectModal - Modal for creating a new project
 * Extracted from HomeScreen.js to improve code organization
 * 
 * This is a large component (~1,337 lines) that handles project creation
 * with extensive form fields, validation, and user selection.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { auth } from '../../../components/firebase';
import { formatPersonName } from '../../../components/formatPersonName';
import { DEFAULT_PHASE } from '../../../features/projects/constants';
import { isValidIsoDateYmd } from '../../../utils/validation';

const NewProjectModal = ({
  // Modal state
  visible,
  parentSubId,
  onClose,
  
  // Project form fields
  newProjectName,
  setNewProjectName,
  newProjectNumber,
  setNewProjectNumber,
  newProjectPhase,
  setNewProjectPhase,
  newProjectCustomer,
  setNewProjectCustomer,
  newProjectClientContactName,
  setNewProjectClientContactName,
  newProjectClientContactPhone,
  setNewProjectClientContactPhone,
  newProjectClientContactEmail,
  setNewProjectClientContactEmail,
  newProjectAddressStreet,
  setNewProjectAddressStreet,
  newProjectAddressPostal,
  setNewProjectAddressPostal,
  newProjectAddressCity,
  setNewProjectAddressCity,
  newProjectPropertyDesignation,
  setNewProjectPropertyDesignation,
  newProjectParticipantsSearch,
  setNewProjectParticipantsSearch,
  newProjectAdvancedOpen,
  setNewProjectAdvancedOpen,
  
  // Responsible and participants
  newProjectResponsible,
  setNewProjectResponsible,
  responsiblePickerVisible,
  setResponsiblePickerVisible,
  newProjectParticipants,
  setNewProjectParticipants,
  participantsPickerVisible,
  setParticipantsPickerVisible,
  
  // Company data
  companyAdmins,
  loadingCompanyAdmins,
  companyAdminsPermissionDenied,
  companyMembers,
  loadingCompanyMembers,
  companyMembersPermissionDenied,
  loadCompanyAdmins,
  
  // Skyddsrond fields
  newProjectSkyddsrondEnabled,
  setNewProjectSkyddsrondEnabled,
  newProjectSkyddsrondWeeks,
  setNewProjectSkyddsrondWeeks,
  newProjectSkyddsrondFirstDueDate,
  setNewProjectSkyddsrondFirstDueDate,
  skyddsrondWeeksPickerVisible,
  setSkyddsrondWeeksPickerVisible,
  newProjectSkyddsrondFirstDueValid,
  
  // Form state
  creatingProject,
  setCreatingProject,
  focusedInput,
  setFocusedInput,
  hoveredSkyddsrondBtn,
  setHoveredSkyddsrondBtn,
  responsibleDropdownOpen,
  setResponsibleDropdownOpen,
  newProjectKeyboardLockHeight,
  setNewProjectKeyboardLockHeight,
  
  // Callbacks and functions
  resetProjectFields,
  isProjectNumberUnique,
  canCreateProject,
  setHierarchy,
  
  // Platform and environment
  isBrowserEnv,
  windowWidth,
  nativeKeyboardHeight,
  nativeKeyboardHeightRef,
  buildStamp,
}) => {
  const { width: windowWidthFromHook } = useWindowDimensions();
  const effectiveWindowWidth = windowWidth || windowWidthFromHook;
  const responsibleDropdownRef = useRef(null);

  const initials = (person) => {
    const name = String(person?.displayName || person?.name || person?.email || '').trim();
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    const a = (parts[0] || '').slice(0, 1);
    const b = (parts[1] || '').slice(0, 1);
    return (a + b).toUpperCase();
  };

  const toggleParticipant = (m) => {
    try {
      const id = (m.uid || m.id);
      const exists = (newProjectParticipants || []).find((p) => (p.uid || p.id) === id);
      if (exists) {
        setNewProjectParticipants((prev) => (prev || []).filter((p) => (p.uid || p.id) !== id));
      } else {
        setNewProjectParticipants((prev) => ([...(prev || []), { uid: id, displayName: m.displayName || null, email: m.email || null, role: m.role || null }]));
      }
    } catch (_e) {}
  };

  const q = String(newProjectParticipantsSearch || '').trim().toLowerCase();
  const visibleMembers = (companyMembers || []).filter((m) => {
    if (!q) return true;
    const n = String(m?.displayName || m?.name || '').toLowerCase();
    const e = String(m?.email || '').toLowerCase();
    return n.includes(q) || e.includes(q);
  });

  const canCreate = canCreateProject;

  const handleClose = () => {
    if (creatingProject) return;
    onClose();
    resetProjectFields();
    setNewProjectKeyboardLockHeight(0);
  };

  const handleCreateProject = async () => {
    if (creatingProject || !canCreate) return;
    setCreatingProject(true);
    try {
      // Insert new project into selected subfolder
      setHierarchy(prev => prev.map(main => ({
        ...main,
        children: main.children.map(sub =>
          sub.id === parentSubId
            ? {
                ...sub,
                children: [
                  ...(sub.children || []),
                  {
                    id: String(newProjectNumber ?? '').trim(),
                    name: String(newProjectName ?? '').trim(),
                    type: 'project',
                    status: 'ongoing',
                    phase: newProjectPhase || DEFAULT_PHASE,
                    customer: String(newProjectCustomer || '').trim() || null,
                    clientContact: {
                      name: String(newProjectClientContactName || '').trim() || null,
                      phone: String(newProjectClientContactPhone || '').trim() || null,
                      email: String(newProjectClientContactEmail || '').trim() || null,
                    },
                    address: {
                      street: String(newProjectAddressStreet || '').trim() || null,
                      postalCode: String(newProjectAddressPostal || '').trim() || null,
                      city: String(newProjectAddressCity || '').trim() || null,
                    },
                    propertyDesignation: String(newProjectPropertyDesignation || '').trim() || null,
                    skyddsrondEnabled: !!newProjectSkyddsrondEnabled,
                    skyddsrondIntervalWeeks: Number(newProjectSkyddsrondWeeks) || 2,
                    skyddsrondFirstDueDate: String(newProjectSkyddsrondFirstDueDate || '').trim() || null,
                    ansvarig: formatPersonName(newProjectResponsible),
                    ansvarigId: newProjectResponsible?.uid || null,
                    participants: (newProjectParticipants || []).map(p => ({ uid: p.uid || p.id, displayName: p.displayName || null, email: p.email || null })),
                    createdAt: new Date().toISOString(),
                    createdBy: auth?.currentUser?.email || ''
                  }
                ]
              }
            : sub
        )
      })));
      // Wait a moment for hierarchy to update and save
      await new Promise(resolve => setTimeout(resolve, 300));
      onClose();
      resetProjectFields();
      setCreatingProject(false);
    } catch (error) {
      console.error('Error creating project:', error);
      setCreatingProject(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={async () => {
        // Fetch admins when the modal opens
        await loadCompanyAdmins({ force: false });
      }}
      onRequestClose={handleClose}
    >
      {isBrowserEnv ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Pressable
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
            onPress={() => {
              onClose();
              resetProjectFields();
            }}
          />
          {(() => {
            const isSmallScreen = effectiveWindowWidth < 900;
            const cardStyle = {
              backgroundColor: '#fff',
              borderRadius: 18,
              width: 1050,
              maxWidth: '96%',
              minWidth: Platform.OS === 'web' ? 600 : 340,
              height: isSmallScreen ? 'auto' : 740,
              maxHeight: '90%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 18,
              elevation: 12,
              overflow: 'hidden',
            };

            const headerStyle = {
              height: 56,
              borderBottomWidth: 1,
              borderBottomColor: '#E6E8EC',
              backgroundColor: '#F8FAFC',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 16,
            };

            const sectionTitle = { fontSize: 13, fontWeight: '500', color: '#111', marginBottom: 10 };
            const labelStyle = { fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 };
            const inputStyleBase = {
              borderWidth: 1,
              borderColor: '#E2E8F0',
              borderRadius: 10,
              paddingVertical: 9,
              paddingHorizontal: 10,
              fontSize: 13,
              backgroundColor: '#fff',
              color: '#111',
              ...(Platform.OS === 'web' ? {
                transition: 'border-color 0.2s, box-shadow 0.2s',
                outline: 'none',
              } : {}),
            };

            const requiredBorder = (ok, isFocused = false) => {
              if (isFocused && ok) {
                return { 
                  borderColor: '#1976D2', 
                  ...(Platform.OS === 'web' ? { boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.1)' } : {}),
                };
              }
              return { borderColor: ok ? '#E2E8F0' : '#EF4444' };
            };

            return (
              <View style={cardStyle}>
                <View style={headerStyle}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>Skapa nytt projekt</Text>
                  <TouchableOpacity
                    style={{ position: 'absolute', right: 12, top: 10, padding: 6 }}
                    onPress={() => {
                      onClose();
                      resetProjectFields();
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={22} color="#111" />
                  </TouchableOpacity>
                </View>

                <View style={{ 
                  flex: 1, 
                  flexDirection: Platform.OS === 'web' ? (isSmallScreen ? 'column' : 'row') : 'row',
                }}>
                  {/* Left column */}
                  <View style={{ 
                    flex: 1, 
                    borderRightWidth: Platform.OS === 'web' && !isSmallScreen ? 1 : 0,
                    borderBottomWidth: Platform.OS === 'web' && isSmallScreen ? 1 : 0,
                    borderRightColor: '#E6E8EC',
                    borderBottomColor: '#E6E8EC',
                    backgroundColor: '#fff' 
                  }}>
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 22 }}>
                      <Text style={sectionTitle}>Projektinformation</Text>

                      <View style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={labelStyle}>Projektnummer *</Text>
                          {String(newProjectNumber ?? '').trim() !== '' && isProjectNumberUnique(newProjectNumber) ? (
                            <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
                          ) : null}
                        </View>
                        <TextInput
                          value={newProjectNumber}
                          onChangeText={(v) => {
                            const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                            setNewProjectNumber(String(next));
                          }}
                          onFocus={() => setFocusedInput('projectNumber')}
                          onBlur={() => setFocusedInput(null)}
                          onSubmitEditing={() => {
                            // Move focus to project name on Enter (native)
                            if (Platform.OS !== 'web') {
                              // Focus will be handled by returnKeyType on native
                            }
                          }}
                          returnKeyType="next"
                          blurOnSubmit={false}
                          placeholder="Projektnummer..."
                          placeholderTextColor="#94A3B8"
                          style={{
                            ...inputStyleBase,
                            ...requiredBorder(
                              String(newProjectNumber ?? '').trim() !== '' && isProjectNumberUnique(newProjectNumber),
                              focusedInput === 'projectNumber'
                            ),
                            color: (!isProjectNumberUnique(newProjectNumber) && String(newProjectNumber ?? '').trim() !== '') ? '#B91C1C' : '#111',
                          }}
                          autoFocus
                        />
                        {String(newProjectNumber ?? '').trim() !== '' && !isProjectNumberUnique(newProjectNumber) ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                            <Ionicons name="warning" size={16} color="#B91C1C" style={{ marginRight: 6 }} />
                            <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '700' }}>Projektnummer används redan.</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={labelStyle}>Projektnamn *</Text>
                          {String(newProjectName ?? '').trim() !== '' ? (
                            <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
                          ) : null}
                        </View>
                        <TextInput
                          value={newProjectName}
                          onChangeText={(v) => {
                            const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                            setNewProjectName(String(next));
                          }}
                          onFocus={() => setFocusedInput('projectName')}
                          onBlur={() => setFocusedInput(null)}
                          onSubmitEditing={() => {
                            // If form is valid, create project on Enter (native)
                            if (canCreate && !creatingProject && Platform.OS !== 'web') {
                              // Will be handled by the button's onPress
                            }
                          }}
                          returnKeyType={canCreate ? "done" : "next"}
                          blurOnSubmit={true}
                          placeholder="Projektnamn..."
                          placeholderTextColor="#94A3B8"
                          style={{ 
                            ...inputStyleBase, 
                            ...requiredBorder(String(newProjectName ?? '').trim() !== '', focusedInput === 'projectName'),
                          }}
                        />
                      </View>

                      <Text style={labelStyle}>Kund</Text>
                      <TextInput
                        value={newProjectCustomer}
                        onChangeText={(v) => {
                          const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                          setNewProjectCustomer(String(next));
                        }}
                        placeholder="Kundens företagsnamn..."
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 14 }}
                      />

                      <Text style={{ ...labelStyle, marginBottom: 8 }}>Uppgifter till projektansvarig hos beställaren</Text>
                      <TextInput
                        value={newProjectClientContactName}
                        onChangeText={(v) => setNewProjectClientContactName(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                        placeholder="Namn"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 10 }}
                      />
                      <TextInput
                        value={newProjectClientContactPhone}
                        onChangeText={(v) => setNewProjectClientContactPhone(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                        placeholder="Telefonnummer"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 10 }}
                      />
                      <TextInput
                        value={newProjectClientContactEmail}
                        onChangeText={(v) => setNewProjectClientContactEmail(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                        placeholder="namn@foretag.se"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 14 }}
                      />

                      <Text style={labelStyle}>Adress</Text>
                      <TextInput
                        value={newProjectAddressStreet}
                        onChangeText={(v) => setNewProjectAddressStreet(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                        placeholder="Gata och nr..."
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 10 }}
                      />
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                        <TextInput
                          value={newProjectAddressPostal}
                          onChangeText={(v) => setNewProjectAddressPostal(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                          placeholder="Postnummer"
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, flex: 0.45 }}
                        />
                        <TextInput
                          value={newProjectAddressCity}
                          onChangeText={(v) => setNewProjectAddressCity(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                          placeholder="Ort"
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, flex: 0.55 }}
                        />
                      </View>
                      <TextInput
                        value={newProjectPropertyDesignation}
                        onChangeText={(v) => setNewProjectPropertyDesignation(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                        placeholder="Fastighetsbeteckning"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 14 }}
                      />

                      {/* Skyddsronder is controlled from the bottom-right dropdown (web V2). */}
                    </ScrollView>
                  </View>

                  {/* Right column */}
                  <View style={{ flex: 1, backgroundColor: '#fff' }}>
                    <View style={{ flex: 1, padding: 18, paddingBottom: 10 }}>
                      <Text style={sectionTitle}>Ansvariga och deltagare</Text>

                      <View style={{ marginBottom: 12, position: 'relative', zIndex: responsibleDropdownOpen ? 1000 : 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={labelStyle}>Ansvarig *</Text>
                          {newProjectResponsible ? (
                            <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
                          ) : null}
                        </View>
                        <View style={{ position: 'relative', zIndex: responsibleDropdownOpen ? 1001 : 1 }} ref={responsibleDropdownRef}>
                          <TouchableOpacity
                            style={{
                              ...inputStyleBase,
                              ...(newProjectResponsible ? {} : { borderColor: '#EF4444' }),
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              ...(focusedInput === 'responsible' && newProjectResponsible ? {
                                borderColor: '#1976D2',
                                ...(Platform.OS === 'web' ? { boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.1)' } : {}),
                              } : {}),
                              ...(responsibleDropdownOpen && Platform.OS === 'web' ? {
                                borderColor: '#1976D2',
                                borderBottomLeftRadius: 0,
                                borderBottomRightRadius: 0,
                                boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.1)',
                              } : {}),
                            }}
                            onPress={() => {
                              if (Platform.OS === 'web') {
                                setFocusedInput('responsible');
                                setResponsibleDropdownOpen(!responsibleDropdownOpen);
                              } else {
                                setResponsiblePickerVisible(true);
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={{ fontSize: 13, color: newProjectResponsible ? '#111' : '#94A3B8', fontWeight: '700' }} numberOfLines={1}>
                              {newProjectResponsible ? formatPersonName(newProjectResponsible) : 'Välj ansvarig...'}
                            </Text>
                            <Ionicons 
                              name={responsibleDropdownOpen ? "chevron-up" : "chevron-down"} 
                              size={16} 
                              color="#111" 
                            />
                          </TouchableOpacity>

                          {/* Web dropdown menu */}
                          {Platform.OS === 'web' && responsibleDropdownOpen && (
                            <View
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                backgroundColor: '#fff',
                                borderWidth: 1,
                                borderColor: '#1976D2',
                                borderTopWidth: 0,
                                borderRadius: 10,
                                borderTopLeftRadius: 0,
                                borderTopRightRadius: 0,
                                maxHeight: 280,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.15,
                                shadowRadius: 12,
                                elevation: 8,
                                zIndex: 1002,
                                overflow: 'hidden',
                                ...(Platform.OS === 'web' ? {
                                  opacity: 1,
                                  backgroundColor: '#ffffff',
                                } : {}),
                              }}
                            >
                              {loadingCompanyAdmins ? (
                                <View style={{ padding: 16, alignItems: 'center' }}>
                                  <Text style={{ color: '#64748b', fontSize: 13 }}>Laddar...</Text>
                                </View>
                              ) : companyAdminsPermissionDenied ? (
                                <View style={{ padding: 16 }}>
                                  <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '700' }}>
                                    Saknar behörighet att läsa användare.
                                  </Text>
                                </View>
                              ) : companyAdmins.length === 0 ? (
                                <View style={{ padding: 16 }}>
                                  <Text style={{ color: '#64748b', fontSize: 13 }}>Inga admins hittades.</Text>
                                </View>
                              ) : (
                                <ScrollView 
                                  style={{ 
                                    maxHeight: 280,
                                    backgroundColor: '#fff',
                                  }}
                                  contentContainerStyle={{
                                    paddingBottom: 4,
                                  }}
                                  nestedScrollEnabled
                                >
                                  {companyAdmins.map((m) => {
                                    const isSelected = newProjectResponsible && (
                                      (newProjectResponsible.uid || newProjectResponsible.id) === (m.uid || m.id)
                                    );
                                    return (
                                      <TouchableOpacity
                                        key={m.id || m.uid || m.email}
                                        style={{
                                          paddingVertical: 12,
                                          paddingHorizontal: 12,
                                          borderBottomWidth: 1,
                                          borderBottomColor: '#EEF0F3',
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          gap: 10,
                                          backgroundColor: isSelected ? '#EFF6FF' : '#fff',
                                          ...(Platform.OS === 'web' ? {
                                            cursor: 'pointer',
                                            transition: 'background-color 0.15s',
                                            opacity: 1,
                                          } : {}),
                                        }}
                                        onPress={() => {
                                          setNewProjectResponsible({
                                            uid: m.uid || m.id,
                                            displayName: m.displayName || null,
                                            email: m.email || null,
                                            role: m.role || null,
                                          });
                                          setResponsibleDropdownOpen(false);
                                          setFocusedInput(null);
                                        }}
                                        activeOpacity={0.7}
                                        onMouseEnter={Platform.OS === 'web' ? (e) => {
                                          if (!isSelected && e?.currentTarget) {
                                            e.currentTarget.style.backgroundColor = '#F8FAFC';
                                          }
                                        } : undefined}
                                        onMouseLeave={Platform.OS === 'web' ? (e) => {
                                          if (!isSelected && e?.currentTarget) {
                                            e.currentTarget.style.backgroundColor = '#fff';
                                          }
                                        } : undefined}
                                      >
                                        <View style={{ 
                                          width: 24, 
                                          height: 24, 
                                          borderRadius: 12, 
                                          backgroundColor: '#1E40AF', 
                                          alignItems: 'center', 
                                          justifyContent: 'center' 
                                        }}>
                                          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10 }}>
                                            {initials(m)}
                                          </Text>
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                          <Text 
                                            numberOfLines={1} 
                                            style={{ 
                                              fontSize: 13, 
                                              fontWeight: isSelected ? '700' : '600', 
                                              color: '#111' 
                                            }}
                                          >
                                            {formatPersonName(m)}
                                          </Text>
                                        </View>
                                        {isSelected && (
                                          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                                        )}
                                      </TouchableOpacity>
                                    );
                                  })}
                                </ScrollView>
                              )}
                            </View>
                          )}
                        </View>
                        {!newProjectResponsible && !responsibleDropdownOpen ? (
                          <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: 6, fontWeight: '700' }}>
                            Du måste välja ansvarig.
                          </Text>
                        ) : null}
                      </View>

                      <Text style={labelStyle}>Deltagare</Text>
                      <View style={{ ...inputStyleBase, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Ionicons name="search" size={16} color="#64748b" />
                        <TextInput
                          value={newProjectParticipantsSearch}
                          onChangeText={(v) => setNewProjectParticipantsSearch(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                          placeholder="Sök användare..."
                          placeholderTextColor="#94A3B8"
                          style={{ flex: 1, fontSize: 13, color: '#111' }}
                        />
                      </View>

                      <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, overflow: 'hidden', flex: 1, minHeight: 260 }}>
                        {loadingCompanyMembers ? (
                          <View style={{ padding: 12 }}>
                            <Text style={{ color: '#64748b', fontSize: 13 }}>Laddar…</Text>
                          </View>
                        ) : companyMembersPermissionDenied ? (
                          <View style={{ padding: 12 }}>
                            <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '700' }}>Saknar behörighet att läsa användare.</Text>
                          </View>
                        ) : visibleMembers.length === 0 ? (
                          <View style={{ padding: 12 }}>
                            <Text style={{ color: '#64748b', fontSize: 13 }}>Inga träffar.</Text>
                          </View>
                        ) : (
                          <ScrollView 
                            style={{ flex: 1 }}
                            contentContainerStyle={Platform.OS === 'web' ? {
                              scrollbarWidth: 'thin',
                              scrollbarColor: '#CBD5E1 #F1F5F9',
                            } : {}}
                          >
                            {Platform.OS === 'web' && (
                              <style>{`
                                ::-webkit-scrollbar {
                                  width: 8px;
                                }
                                ::-webkit-scrollbar-track {
                                  background: #F1F5F9;
                                  border-radius: 4px;
                                }
                                ::-webkit-scrollbar-thumb {
                                  background: #CBD5E1;
                                  border-radius: 4px;
                                }
                                ::-webkit-scrollbar-thumb:hover {
                                  background: #94A3B8;
                                }
                              `}</style>
                            )}
                            {visibleMembers.slice(0, 200).map((m) => {
                              const id = m.id || m.uid || m.email;
                              const selected = !!(newProjectParticipants || []).find((p) => (p.uid || p.id) === (m.uid || m.id));
                              return (
                                <TouchableOpacity
                                  key={id}
                                  onPress={() => toggleParticipant(m)}
                                  style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                    borderBottomWidth: 1,
                                    borderBottomColor: '#EEF0F3',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    backgroundColor: selected ? '#EFF6FF' : '#fff',
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E40AF', alignItems: 'center', justifyContent: 'center' }}>
                                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{initials(m)}</Text>
                                    </View>
                                    <View style={{ minWidth: 0, flex: 1 }}>
                                      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '800', color: '#111' }}>{formatPersonName(m)}</Text>
                                      <Text numberOfLines={1} style={{ fontSize: 12, color: '#64748b' }}>{String(m?.role || '').trim() || 'Användare'}</Text>
                                    </View>
                                  </View>

                                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: selected ? '#2563EB' : '#CBD5E1', backgroundColor: selected ? '#2563EB' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                    {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        )}
                      </View>

                      <TouchableOpacity
                        onPress={() => {
                          try { setNewProjectParticipantsSearch(''); } catch (_e) {}
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 4 }}
                      >
                        <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BAE6FD' }}>
                          <Ionicons name="add" size={16} color="#0369A1" />
                        </View>
                        <Text style={{ color: '#1976D2', fontWeight: '500', fontSize: 13 }}>Lägg till deltagare</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E6E8EC', backgroundColor: '#fff', position: 'relative' }}>
                      {newProjectAdvancedOpen ? (
                        <View
                          style={{
                            position: 'absolute',
                            left: 24,
                            bottom: 66,
                            width: 340,
                            backgroundColor: '#fff',
                            borderWidth: 1,
                            borderColor: '#E6E8EC',
                            borderRadius: 14,
                            padding: 14,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.18,
                            shadowRadius: 18,
                            elevation: 12,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <Text style={{ fontSize: 13, fontWeight: '500', color: '#111' }}>Skyddsronder</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 12, color: '#475569', fontWeight: '500' }}>{newProjectSkyddsrondEnabled ? 'Aktiva' : 'Av'}</Text>
                              <Switch
                                value={!!newProjectSkyddsrondEnabled}
                                onValueChange={(v) => {
                                  const next = !!v;
                                  setNewProjectSkyddsrondEnabled(next);
                                  if (!next) {
                                    try { setNewProjectSkyddsrondFirstDueDate(''); } catch (_e) {}
                                  }
                                }}
                              />
                            </View>
                          </View>

                          <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Veckor mellan skyddsronder</Text>
                          <TouchableOpacity
                            style={{
                              ...inputStyleBase,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              opacity: newProjectSkyddsrondEnabled ? 1 : 0.5,
                              marginBottom: 10,
                            }}
                            disabled={!newProjectSkyddsrondEnabled}
                            onPress={() => setSkyddsrondWeeksPickerVisible(true)}
                            activeOpacity={0.8}
                          >
                            <Text style={{ fontSize: 13, color: '#111', fontWeight: '500' }}>{String(newProjectSkyddsrondWeeks || 2)}</Text>
                            <Ionicons name="chevron-down" size={16} color="#111" />
                          </TouchableOpacity>

                          <View style={{ marginBottom: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                              <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155' }}>Första skyddsrond senast *</Text>
                              {newProjectSkyddsrondEnabled && newProjectSkyddsrondFirstDueValid ? (
                                <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
                              ) : null}
                            </View>
                            <TextInput
                              value={newProjectSkyddsrondFirstDueDate}
                              onChangeText={(v) => {
                                const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                                setNewProjectSkyddsrondFirstDueDate(String(next));
                              }}
                              onFocus={() => setFocusedInput('skyddsrondDate')}
                              onBlur={() => setFocusedInput(null)}
                              placeholder="YYYY-MM-DD"
                              placeholderTextColor="#94A3B8"
                              editable={!!newProjectSkyddsrondEnabled}
                              style={{
                                ...inputStyleBase,
                                ...requiredBorder(
                                  newProjectSkyddsrondFirstDueValid || !newProjectSkyddsrondEnabled,
                                  focusedInput === 'skyddsrondDate' && newProjectSkyddsrondEnabled
                                ),
                                ...((!newProjectSkyddsrondFirstDueValid && newProjectSkyddsrondEnabled) ? { borderColor: '#EF4444' } : {}),
                                opacity: newProjectSkyddsrondEnabled ? 1 : 0.5,
                              }}
                            />

                            {newProjectSkyddsrondEnabled && !newProjectSkyddsrondFirstDueValid ? (
                              <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: 6, fontWeight: '500' }}>
                                Ange datum (YYYY-MM-DD).
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ) : null}

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <TouchableOpacity
                          onPress={() => {
                            if (!newProjectSkyddsrondEnabled) {
                              setNewProjectSkyddsrondEnabled(true);
                            }
                            setNewProjectAdvancedOpen((v) => !v ? true : !v);
                          }}
                          onMouseEnter={Platform.OS === 'web' ? () => setHoveredSkyddsrondBtn(true) : undefined}
                          onMouseLeave={Platform.OS === 'web' ? () => setHoveredSkyddsrondBtn(false) : undefined}
                          style={{
                            borderWidth: 2,
                            borderColor: newProjectSkyddsrondEnabled ? '#3B82F6' : (hoveredSkyddsrondBtn ? '#93C5FD' : '#E2E8F0'),
                            backgroundColor: newProjectSkyddsrondEnabled ? '#EFF6FF' : (hoveredSkyddsrondBtn ? '#F8FAFC' : '#fff'),
                            borderRadius: 999,
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            ...(Platform.OS === 'web' ? {
                              transition: 'all 0.2s',
                              transform: hoveredSkyddsrondBtn ? 'scale(1.02)' : 'scale(1)',
                              boxShadow: newProjectSkyddsrondEnabled ? '0 2px 8px rgba(59, 130, 246, 0.2)' : 'none',
                            } : {}),
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons 
                            name={newProjectSkyddsrondEnabled ? "shield-checkmark" : "shield-outline"} 
                            size={18} 
                            color={newProjectSkyddsrondEnabled ? '#1D4ED8' : '#64748b'} 
                          />
                          <Text style={{ 
                            fontSize: 13, 
                            fontWeight: newProjectSkyddsrondEnabled ? '600' : '500', 
                            color: newProjectSkyddsrondEnabled ? '#1D4ED8' : '#0F172A' 
                          }}>
                            {newProjectSkyddsrondEnabled ? 'Skyddsronder: Aktiva' : 'Aktivera skyddsronder'}
                          </Text>
                          <Ionicons 
                            name={newProjectAdvancedOpen ? 'chevron-down' : 'chevron-up'} 
                            size={14} 
                            color={newProjectSkyddsrondEnabled ? '#1D4ED8' : '#0F172A'} 
                          />
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                          <TouchableOpacity
                            disabled={creatingProject}
                            onPress={() => {
                              if (creatingProject) return;
                              onClose();
                              resetProjectFields();
                            }}
                            style={{ 
                              backgroundColor: '#E5E7EB', 
                              borderRadius: 10, 
                              paddingVertical: 12, 
                              paddingHorizontal: 18, 
                              minWidth: 110, 
                              alignItems: 'center',
                              opacity: creatingProject ? 0.5 : 1,
                              ...(Platform.OS === 'web' ? {
                                transition: 'background-color 0.2s',
                                cursor: creatingProject ? 'not-allowed' : 'pointer',
                              } : {}),
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={{ color: '#111', fontWeight: '800', fontSize: 14 }}>Avbryt</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            data-create-project-btn={Platform.OS === 'web' ? true : undefined}
                            disabled={!canCreate || creatingProject}
                            onPress={handleCreateProject}
                            style={{
                              backgroundColor: (canCreate && !creatingProject) ? '#1976D2' : '#94A3B8',
                              borderRadius: 10,
                              paddingVertical: 12,
                              paddingHorizontal: 18,
                              minWidth: 110,
                              alignItems: 'center',
                              flexDirection: 'row',
                              justifyContent: 'center',
                              gap: 8,
                              opacity: (canCreate && !creatingProject) ? 1 : 0.6,
                              ...(Platform.OS === 'web' && canCreate && !creatingProject ? {
                                transition: 'background-color 0.2s, transform 0.1s',
                                cursor: 'pointer',
                              } : {}),
                            }}
                            activeOpacity={0.85}
                          >
                            {creatingProject ? (
                              <>
                                <View style={{ 
                                  width: 16, 
                                  height: 16, 
                                  borderWidth: 2, 
                                  borderColor: '#fff', 
                                  borderTopColor: 'transparent', 
                                  borderRadius: 8,
                                  ...(Platform.OS === 'web' ? {
                                    animation: 'spin 0.8s linear infinite',
                                  } : {}),
                                }} />
                                {Platform.OS === 'web' && (
                                  <style>{`
                                    @keyframes spin {
                                      to { transform: rotate(360deg); }
                                    }
                                  `}</style>
                                )}
                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Skapar...</Text>
                              </>
                            ) : (
                              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Skapa</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          })()}

          <Modal
            visible={responsiblePickerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setResponsiblePickerVisible(false)}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Pressable
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                onPress={() => setResponsiblePickerVisible(false)}
              />
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, width: 340, maxHeight: 520, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12, textAlign: 'center' }}>
                  Välj ansvarig
                </Text>
                {loadingCompanyAdmins ? (
                  <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8 }}>
                    Laddar...
                  </Text>
                ) : (companyAdmins.length === 0 ? (
                  <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                    Inga admins hittades i företaget.
                  </Text>
                ) : (
                  <ScrollView style={{ maxHeight: 420 }}>
                    {companyAdmins.map((m) => (
                      <TouchableOpacity
                        key={m.id || m.uid || m.email}
                        style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                        onPress={() => {
                          setNewProjectResponsible({
                            uid: m.uid || m.id,
                            displayName: m.displayName || null,
                            email: m.email || null,
                            role: m.role || null,
                          });
                          setResponsiblePickerVisible(false);
                        }}
                      >
                        <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                          {formatPersonName(m)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ))}

                <TouchableOpacity
                  style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                  onPress={() => setResponsiblePickerVisible(false)}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>
      ) : (
        (() => {
          const effectiveKb = responsiblePickerVisible
            ? Math.max(nativeKeyboardHeight || 0, newProjectKeyboardLockHeight || 0)
            : (nativeKeyboardHeight || 0);
          // Lift the modal above the keyboard. Keep a small margin so it doesn't over-shoot.
          const lift = Math.max(0, effectiveKb - 12);
          const hasKeyboard = lift > 40; // if keyboard is visible, treat as bottom-aligned
          return (
            <View
              style={{
                flex: 1,
                justifyContent: hasKeyboard ? 'flex-end' : 'center',
                alignItems: 'center',
                paddingBottom: hasKeyboard ? 16 + lift : 0,
              }}
            >
              <Pressable
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                onPress={() => {
                  onClose();
                  resetProjectFields();
                  setNewProjectKeyboardLockHeight(0);
                }}
              />
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 20, width: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                <TouchableOpacity
                  style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                  onPress={() => {
                    onClose();
                    resetProjectFields();
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={26} color="#222" />
                </TouchableOpacity>

                <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center', marginTop: 6 }}>{`Skapa nytt projekt${buildStamp ? ` (${buildStamp})` : ''}`}</Text>
                {buildStamp && (
                  <View style={{ position: 'absolute', left: 12, top: 14, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' }}>
                    <Text style={{ fontSize: 10, color: '#92400E', fontWeight: '900' }}>{`LEGACY  OS=${String(Platform.OS)}`}</Text>
                  </View>
                )}

                <TextInput
                  value={newProjectNumber}
                  onChangeText={(v) => {
                    // RN-web can sometimes deliver an event object; normalize to string to avoid crashes.
                    const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                    setNewProjectNumber(String(next));
                  }}
                  placeholder="Projektnummer..."
                  placeholderTextColor="#888"
                  style={{
                    borderWidth: 1,
                    borderColor: String(newProjectNumber ?? '').trim() === '' || !isProjectNumberUnique(newProjectNumber) ? '#D32F2F' : '#e0e0e0',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 16,
                    marginBottom: 10,
                    backgroundColor: '#fafafa',
                    color: !isProjectNumberUnique(newProjectNumber) && String(newProjectNumber ?? '').trim() !== '' ? '#D32F2F' : '#222'
                  }}
                  autoFocus
                  keyboardType="default"
                />
                {String(newProjectNumber ?? '').trim() !== '' && !isProjectNumberUnique(newProjectNumber) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 6 }}>
                    <Ionicons name="warning" size={18} color="#D32F2F" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#D32F2F', fontSize: 15, fontWeight: 'bold' }}>Projektnummer används redan.</Text>
                  </View>
                )}

                <TextInput
                  value={newProjectName}
                  onChangeText={(v) => {
                    const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                    setNewProjectName(String(next));
                  }}
                  placeholder="Projektnamn..."
                  placeholderTextColor="#888"
                  style={{
                    borderWidth: 1,
                    borderColor: String(newProjectName ?? '').trim() === '' ? '#D32F2F' : '#e0e0e0',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 16,
                    marginBottom: 12,
                    backgroundColor: '#fafafa',
                    color: '#222'
                  }}
                  keyboardType="default"
                />

                {/* Ansvarig (required) */}
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 }}>
                  Ansvarig
                </Text>
                <TouchableOpacity
                  style={{
                    borderWidth: 1,
                    borderColor: newProjectResponsible ? '#e0e0e0' : '#D32F2F',
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    marginBottom: 12,
                    backgroundColor: '#fafafa',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onPress={() => {
                    // Opening the picker dismisses the keyboard on iOS/Android.
                    // Lock the current keyboard height so this modal doesn't jump down.
                    setNewProjectKeyboardLockHeight(nativeKeyboardHeightRef?.current || nativeKeyboardHeight || 0);
                    try { Keyboard.dismiss(); } catch(_e) {}
                    // If admins weren't loaded yet (or modal opened too early), fetch now.
                    if ((!companyAdmins || companyAdmins.length === 0) && !loadingCompanyAdmins) {
                      loadCompanyAdmins({ force: true });
                    }
                    setResponsiblePickerVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16, color: newProjectResponsible ? '#222' : '#888' }} numberOfLines={1}>
                    {newProjectResponsible ? formatPersonName(newProjectResponsible) : 'Välj ansvarig...'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#222" />
                </TouchableOpacity>

                {/* Deltagare (optional, multi-select) */}
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 }}>
                  Deltagare
                </Text>
                <TouchableOpacity
                  style={{
                    borderWidth: 1,
                    borderColor: '#e0e0e0',
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    marginBottom: 12,
                    backgroundColor: '#fafafa',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onPress={() => {
                    setNewProjectKeyboardLockHeight(nativeKeyboardHeightRef?.current || nativeKeyboardHeight || 0);
                    try { Keyboard.dismiss(); } catch(_e) {}
                    if ((!companyAdmins || companyAdmins.length === 0) && !loadingCompanyAdmins) {
                      loadCompanyAdmins({ force: true });
                    }
                    setParticipantsPickerVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16, color: (newProjectParticipants && newProjectParticipants.length > 0) ? '#222' : '#888' }} numberOfLines={1}>
                    {(newProjectParticipants && newProjectParticipants.length > 0) ? newProjectParticipants.map(p => formatPersonName(p)).join(', ') : 'Välj deltagare...'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#222" />
                </TouchableOpacity>

                <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 }}>
                  Första skyddsrond senast
                </Text>
                <TextInput
                  value={newProjectSkyddsrondFirstDueDate}
                  onChangeText={(v) => {
                    const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                    setNewProjectSkyddsrondFirstDueDate(String(next));
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#888"
                  editable={!!newProjectSkyddsrondEnabled}
                  style={{
                    borderWidth: 1,
                    borderColor: (!newProjectSkyddsrondFirstDueValid && newProjectSkyddsrondEnabled) ? '#D32F2F' : '#e0e0e0',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 16,
                    marginBottom: 12,
                    backgroundColor: '#fafafa',
                    color: '#222',
                    opacity: newProjectSkyddsrondEnabled ? 1 : 0.5,
                  }}
                />

                {newProjectSkyddsrondEnabled && !newProjectSkyddsrondFirstDueValid && (
                  <Text style={{ color: '#D32F2F', fontSize: 13, marginTop: -8, marginBottom: 10 }}>
                    Du måste fylla i datum (YYYY-MM-DD).
                  </Text>
                )}

                {!newProjectResponsible && (
                  <Text style={{ color: '#D32F2F', fontSize: 13, marginTop: -8, marginBottom: 10 }}>
                    Du måste välja ansvarig.
                  </Text>
                )}

                <Modal
                  visible={responsiblePickerVisible}
                  transparent
                  animationType="fade"
                  onRequestClose={() => {
                    setResponsiblePickerVisible(false);
                    setNewProjectKeyboardLockHeight(0);
                  }}
                >
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Pressable
                      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                      onPress={() => {
                        setResponsiblePickerVisible(false);
                        setNewProjectKeyboardLockHeight(0);
                      }}
                    />
                    <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, width: 340, maxHeight: 520, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12, textAlign: 'center' }}>
                        Välj ansvarig
                      </Text>
                      {loadingCompanyAdmins ? (
                        <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8 }}>
                          Laddar...
                        </Text>
                      ) : companyAdminsPermissionDenied ? (
                        <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                          Saknar behörighet att läsa admins i företaget. Logga ut/in eller kontakta admin.
                        </Text>
                      ) : companyAdmins.length === 0 ? (
                        <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                          Inga admins hittades i företaget. Om du nyss lades till, logga ut/in och försök igen.
                        </Text>
                      ) : (
                        <ScrollView style={{ maxHeight: 420 }}>
                          {companyAdmins.map((m) => (
                            <TouchableOpacity
                              key={m.id || m.uid || m.email}
                              style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                              onPress={() => {
                                setNewProjectResponsible({
                                  uid: m.uid || m.id,
                                  displayName: m.displayName || null,
                                  email: m.email || null,
                                  role: m.role || null,
                                });
                                setResponsiblePickerVisible(false);
                                setNewProjectKeyboardLockHeight(0);
                              }}
                            >
                              <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                                {formatPersonName(m)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}

                      <TouchableOpacity
                        style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                        onPress={() => {
                          setResponsiblePickerVisible(false);
                          setNewProjectKeyboardLockHeight(0);
                        }}
                      >
                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>

                <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 }}>
                  Skyddsronder
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontSize: 15, color: '#555' }}>Aktiva</Text>
                  <Switch
                    value={!!newProjectSkyddsrondEnabled}
                    onValueChange={(v) => setNewProjectSkyddsrondEnabled(!!v)}
                  />
                </View>

                <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 }}>
                  Veckor mellan skyddsronder
                </Text>
                <TouchableOpacity
                  style={{
                    borderWidth: 1,
                    borderColor: '#e0e0e0',
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    marginBottom: 12,
                    backgroundColor: '#fafafa',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    opacity: newProjectSkyddsrondEnabled ? 1 : 0.5,
                  }}
                  disabled={!newProjectSkyddsrondEnabled}
                  onPress={() => setSkyddsrondWeeksPickerVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16, color: '#222' }} numberOfLines={1}>
                    {String(newProjectSkyddsrondWeeks || 2)}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#222" />
                </TouchableOpacity>

                <Modal
                  visible={skyddsrondWeeksPickerVisible}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setSkyddsrondWeeksPickerVisible(false)}
                >
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Pressable
                      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                      onPress={() => setSkyddsrondWeeksPickerVisible(false)}
                    />
                    <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, width: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12, textAlign: 'center' }}>
                        Veckor mellan skyddsronder
                      </Text>
                      {[1, 2, 3, 4].map((w) => (
                        <TouchableOpacity
                          key={String(w)}
                          style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' }}
                          onPress={() => {
                            setNewProjectSkyddsrondWeeks(w);
                            setSkyddsrondWeeksPickerVisible(false);
                          }}
                        >
                          <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                            {w}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                        onPress={() => setSkyddsrondWeeksPickerVisible(false)}
                      >
                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#1976D2',
                      borderRadius: 8,
                      paddingVertical: 12,
                      alignItems: 'center',
                      flex: 1,
                      marginRight: 8,
                      opacity: (String(newProjectName ?? '').trim() === '' || String(newProjectNumber ?? '').trim() === '' || !isProjectNumberUnique(newProjectNumber) || !newProjectResponsible || !newProjectSkyddsrondFirstDueValid) ? 0.5 : 1
                    }}
                    disabled={String(newProjectName ?? '').trim() === '' || String(newProjectNumber ?? '').trim() === '' || !isProjectNumberUnique(newProjectNumber) || !newProjectResponsible || !newProjectSkyddsrondFirstDueValid}
                    onPress={handleCreateProject}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Skapa</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ backgroundColor: '#e0e0e0', borderRadius: 8, paddingVertical: 12, alignItems: 'center', flex: 1, marginLeft: 8 }}
                    onPress={() => {
                      onClose();
                      resetProjectFields();
                    }}
                  >
                    <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })()
      )}
    </Modal>
  );
};

export default NewProjectModal;
