import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ProjectDetailsEditModal({
  editingInfo,
  setEditingInfo,
  windowWidth,
  editableProject,
  setEditableProject,
  setFocusedInput,
  focusedInput,
  saveProjectInfoError,
  setSaveProjectInfoError,
  canEditCreated,
  setCanEditCreated,
  editProjectParticipants,
  setEditProjectParticipants,
  editProjectParticipantsSearch,
  setEditProjectParticipantsSearch,
  companyMembers,
  loadingCompanyMembers,
  companyMembersPermissionDenied,
  companyAdmins,
  loadingCompanyAdmins,
  companyAdminsError,
  responsibleDropdownOpen,
  setResponsibleDropdownOpen,
  participantsDropdownOpen,
  setParticipantsDropdownOpen,
  responsibleDropdownRef,
  participantsDropdownRef,
  adminPickerVisible,
  setAdminPickerVisible,
  skyddsrondWeeksPickerVisible,
  setSkyddsrondWeeksPickerVisible,
  savingProjectInfo,
  setSavingProjectInfo,
  project,
  setProject,
  originalProjectId,
  navigation,
  companyId,
  controls,
  setShowDeleteModal,
  setShowDeleteWarning,
  formatPersonName,
  isValidIsoDateYmd,
  hasDuplicateProjectNumber,
  patchCompanyProject,
  fetchCompanyProject,
  normalizeProject,
  emitProjectUpdated,
  updateSharePointProjectPropertiesFromFirestoreProject,
  enqueueFsExcelSync,
}) {
  return (
    <Modal visible={editingInfo} transparent animationType="fade" onRequestClose={() => setEditingInfo(false)}>
      {Platform.OS === 'web' ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Pressable
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
            onPress={() => setEditingInfo(false)}
          />
          {(() => {
            const isSmallScreen = windowWidth < 900;
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
              overflow: Platform.OS === 'web' ? 'visible' : 'hidden',
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
                const exists = (editProjectParticipants || []).find((p) => (p.uid || p.id) === id);
                if (exists) {
                  setEditProjectParticipants((prev) => (prev || []).filter((p) => (p.uid || p.id) !== id));
                } else {
                  setEditProjectParticipants((prev) => ([...(prev || []), { uid: id, displayName: m.displayName || null, email: m.email || null, role: m.role || null }]));
                }
              } catch (_e) {}
            };

            const q = String(editProjectParticipantsSearch || '').trim().toLowerCase();
            const visibleMembers = (companyMembers || []).filter((m) => {
              if (!q) return true;
              const n = String(m?.displayName || m?.name || '').toLowerCase();
              const e = String(m?.email || '').toLowerCase();
              return n.includes(q) || e.includes(q);
            });

            const getAddressStreet = () => {
              if (editableProject?.address?.street) return editableProject.address.street;
              if (editableProject?.adress) return editableProject.adress;
              return '';
            };
            const getAddressPostal = () => editableProject?.address?.postalCode || '';
            const getAddressCity = () => editableProject?.address?.city || '';
            const getClientContactName = () => editableProject?.clientContact?.name || '';
            const getClientContactPhone = () => editableProject?.clientContact?.phone || '';
            const getClientContactEmail = () => editableProject?.clientContact?.email || '';

            return (
              <View style={cardStyle}>
                <View style={headerStyle}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>Projektinformation</Text>
                  <TouchableOpacity
                    style={{ position: 'absolute', right: 12, top: 10, padding: 6 }}
                    onPress={() => setEditingInfo(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={22} color="#111" />
                  </TouchableOpacity>
                </View>

                <View style={{
                  flex: 1,
                  flexDirection: Platform.OS === 'web' ? (isSmallScreen ? 'column' : 'row') : 'row',
                }}>
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

                      <View style={{ marginBottom: 12 }}>
                        <Text style={labelStyle}>Projektnummer *</Text>
                        <TextInput
                          value={editableProject?.projectNumber || editableProject?.number || editableProject?.id || ''}
                          onChangeText={(v) => setEditableProject(p => ({ ...p, projectNumber: v, number: v }))}
                          onFocus={() => setFocusedInput('projectNumber')}
                          onBlur={() => setFocusedInput(null)}
                          placeholder="Projektnummer..."
                          placeholderTextColor="#94A3B8"
                          style={{
                            ...inputStyleBase,
                            ...requiredBorder(String(editableProject?.projectNumber || editableProject?.number || editableProject?.id || '').trim() !== '', focusedInput === 'projectNumber'),
                          }}
                          autoCapitalize="none"
                        />
                      </View>

                      <View style={{ marginBottom: 12 }}>
                        <Text style={labelStyle}>Projektnamn *</Text>
                        <TextInput
                          value={editableProject?.projectName || editableProject?.name || ''}
                          onChangeText={(v) => setEditableProject(p => ({ ...p, projectName: v, name: v }))}
                          onFocus={() => setFocusedInput('projectName')}
                          onBlur={() => setFocusedInput(null)}
                          placeholder="Projektnamn..."
                          placeholderTextColor="#94A3B8"
                          style={{
                            ...inputStyleBase,
                            ...requiredBorder(String(editableProject?.projectName || editableProject?.name || '').trim() !== '', focusedInput === 'projectName'),
                          }}
                          autoCapitalize="words"
                        />
                      </View>

                      {saveProjectInfoError ? (
                        <View style={{ marginTop: 6, marginBottom: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', padding: 10, borderRadius: 10 }}>
                          <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '600' }}>{String(saveProjectInfoError)}</Text>
                        </View>
                      ) : null}

                      <View style={{ marginBottom: 12 }}>
                        <Text style={labelStyle}>Skapad</Text>
                        <TouchableOpacity
                          activeOpacity={1}
                          onLongPress={() => setCanEditCreated(true)}
                          delayLongPress={2000}
                        >
                          <TextInput
                            style={{
                              ...inputStyleBase,
                              backgroundColor: canEditCreated ? '#fff' : '#F1F5F9',
                              color: canEditCreated ? '#111' : '#64748B',
                              pointerEvents: 'none',
                            }}
                            value={editableProject?.createdAt ? new Date(editableProject.createdAt).toISOString().slice(0, 10) : ''}
                            editable={false}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor="#94A3B8"
                          />
                          {!canEditCreated && (
                            <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4, textAlign: 'center' }}>
                              Håll in 2 sekunder för att ändra datum
                            </Text>
                          )}
                        </TouchableOpacity>
                        {canEditCreated && (
                          <Modal visible={canEditCreated} transparent animationType="fade" onRequestClose={() => setCanEditCreated(false)}>
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.30)' }}>
                              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, minWidth: 260, maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                                <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>Välj nytt skapad-datum</Text>
                                <TextInput
                                  style={{ borderWidth: 1, borderColor: '#1976D2', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fafafa', color: '#222', marginBottom: 12 }}
                                  value={editableProject?.createdAt ? new Date(editableProject.createdAt).toISOString().slice(0, 10) : ''}
                                  onChangeText={v => {
                                    const today = new Date();
                                    const inputDate = new Date(v);
                                    if (inputDate > today) return;
                                    setEditableProject(p => ({ ...p, createdAt: v }));
                                  }}
                                  placeholder="YYYY-MM-DD"
                                  placeholderTextColor="#bbb"
                                  keyboardType="numeric"
                                />
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                  <TouchableOpacity
                                    style={{ backgroundColor: '#1976D2', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1, marginRight: 8 }}
                                    onPress={() => setCanEditCreated(false)}
                                  >
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Spara</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1, marginLeft: 8 }}
                                    onPress={() => setCanEditCreated(false)}
                                  >
                                    <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          </Modal>
                        )}
                      </View>

                      <Text style={labelStyle}>Kund</Text>
                      <TextInput
                        value={editableProject?.customer || editableProject?.client || ''}
                        onChangeText={(v) => setEditableProject(p => ({ ...p, customer: v, client: v }))}
                        placeholder="Kundens företagsnamn..."
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 14 }}
                      />

                      <Text style={{ ...labelStyle, marginBottom: 8 }}>Uppgifter till projektansvarig hos beställaren</Text>
                      <TextInput
                        value={getClientContactName()}
                        onChangeText={(v) => setEditableProject(p => ({
                          ...p,
                          clientContact: {
                            ...(p?.clientContact || {}),
                            name: v,
                          },
                        }))}
                        placeholder="Namn"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 10 }}
                      />
                      <TextInput
                        value={getClientContactPhone()}
                        onChangeText={(v) => setEditableProject(p => ({
                          ...p,
                          clientContact: {
                            ...(p?.clientContact || {}),
                            phone: v,
                          },
                        }))}
                        placeholder="Telefonnummer"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 10 }}
                      />
                      <TextInput
                        value={getClientContactEmail()}
                        onChangeText={(v) => setEditableProject(p => ({
                          ...p,
                          clientContact: {
                            ...(p?.clientContact || {}),
                            email: v,
                          },
                        }))}
                        placeholder="namn@foretag.se"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 14 }}
                      />

                      <Text style={labelStyle}>Adress</Text>
                      <TextInput
                        value={getAddressStreet()}
                        onChangeText={(v) => setEditableProject(p => ({
                          ...p,
                          address: {
                            ...(p?.address || {}),
                            street: v,
                          },
                          adress: v,
                        }))}
                        placeholder="Gata och nr..."
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 10 }}
                      />
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                        <TextInput
                          value={getAddressPostal()}
                          onChangeText={(v) => setEditableProject(p => ({
                            ...p,
                            address: {
                              ...(p?.address || {}),
                              postalCode: v,
                            },
                          }))}
                          placeholder="Postnummer"
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, flex: 0.45 }}
                        />
                        <TextInput
                          value={getAddressCity()}
                          onChangeText={(v) => setEditableProject(p => ({
                            ...p,
                            address: {
                              ...(p?.address || {}),
                              city: v,
                            },
                          }))}
                          placeholder="Ort"
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, flex: 0.55 }}
                        />
                      </View>
                      <TextInput
                        value={editableProject?.propertyDesignation || editableProject?.fastighetsbeteckning || ''}
                        onChangeText={(v) => setEditableProject(p => ({ ...p, propertyDesignation: v, fastighetsbeteckning: v }))}
                        placeholder="Fastighetsbeteckning"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 14 }}
                      />
                    </ScrollView>
                  </View>

                  <View style={{ flex: 1, backgroundColor: '#fff', overflow: 'visible' }}>
                    <View style={{ flex: 1, padding: 18, paddingBottom: 10, overflow: 'visible' }}>
                      <Text style={sectionTitle}>Ansvariga och deltagare</Text>

                      <View style={{ marginBottom: 12, position: 'relative', zIndex: responsibleDropdownOpen ? 1000 : 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={labelStyle}>Ansvarig *</Text>
                          {editableProject?.ansvarig ? (
                            <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
                          ) : null}
                        </View>
                        <View style={{ position: 'relative', zIndex: responsibleDropdownOpen ? 1001 : 1 }} ref={responsibleDropdownRef}>
                          <TouchableOpacity
                            style={{
                              ...inputStyleBase,
                              ...(editableProject?.ansvarig ? {} : { borderColor: '#EF4444' }),
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              ...(focusedInput === 'responsible' && editableProject?.ansvarig ? {
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
                                setAdminPickerVisible(true);
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={{ fontSize: 13, color: editableProject?.ansvarig ? '#111' : '#94A3B8', fontWeight: '700' }} numberOfLines={1}>
                              {editableProject?.ansvarig ? formatPersonName(editableProject.ansvarig) : 'Välj ansvarig...'}
                            </Text>
                            <Ionicons
                              name={responsibleDropdownOpen ? "chevron-up" : "chevron-down"}
                              size={16}
                              color="#111"
                            />
                          </TouchableOpacity>

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
                              ) : companyAdminsError ? (
                                <View style={{ padding: 16 }}>
                                  <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '700' }}>
                                    {companyAdminsError}
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
                                    const isSelected = editableProject?.ansvarigId && (
                                      editableProject.ansvarigId === (m.uid || m.id)
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
                                          const uid = m.uid || m.id || null;
                                          const name = formatPersonName(m);
                                          setEditableProject(p => ({
                                            ...(p || {}),
                                            ansvarig: name,
                                            ansvarigId: uid,
                                          }));
                                          setResponsibleDropdownOpen(false);
                                          setFocusedInput(null);
                                        }}
                                        activeOpacity={0.7}
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
                        {!editableProject?.ansvarig && !responsibleDropdownOpen ? (
                          <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: 6, fontWeight: '700' }}>
                            Du måste välja ansvarig.
                          </Text>
                        ) : null}
                      </View>

                      {Platform.OS !== 'web' && (
                        <Modal
                          visible={adminPickerVisible}
                          transparent
                          animationType="fade"
                          onRequestClose={() => setAdminPickerVisible(false)}
                        >
                          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
                            <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: 280, maxWidth: 360 }}>
                              <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 10, textAlign: 'center' }}>
                                Välj ansvarig
                              </Text>

                              {loadingCompanyAdmins ? (
                                <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8 }}>
                                  Laddar...
                                </Text>
                              ) : (companyAdminsError ? (
                                <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                                  {companyAdminsError}
                                </Text>
                              ) : (companyAdmins.length === 0 ? (
                                <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                                  Inga admins hittades i företaget.
                                </Text>
                              ) : (
                                companyAdmins.length <= 5 ? (
                                  <View>
                                    {companyAdmins.map((m) => (
                                      <TouchableOpacity
                                        key={m.id || m.uid || m.email}
                                        style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                                        onPress={() => {
                                          const uid = m.uid || m.id || null;
                                          const name = formatPersonName(m);
                                          setEditableProject(p => ({
                                            ...(p || {}),
                                            ansvarig: name,
                                            ansvarigId: uid,
                                          }));
                                          setAdminPickerVisible(false);
                                        }}
                                      >
                                        <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                                          {formatPersonName(m)}
                                        </Text>
                                      </TouchableOpacity>
                                    ))}
                                  </View>
                                ) : (
                                  <ScrollView style={{ maxHeight: 260 }}>
                                    {companyAdmins.map((m) => (
                                      <TouchableOpacity
                                        key={m.id || m.uid || m.email}
                                        style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                                        onPress={() => {
                                          const uid = m.uid || m.id || null;
                                          const name = formatPersonName(m);
                                          setEditableProject(p => ({
                                            ...(p || {}),
                                            ansvarig: name,
                                            ansvarigId: uid,
                                          }));
                                          setAdminPickerVisible(false);
                                        }}
                                      >
                                        <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                                          {formatPersonName(m)}
                                        </Text>
                                      </TouchableOpacity>
                                    ))}
                                  </ScrollView>
                                )
                              )))}

                              <TouchableOpacity
                                style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                                onPress={() => setAdminPickerVisible(false)}
                              >
                                <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </Modal>
                      )}

                      <View style={{ marginBottom: 12, position: 'relative', zIndex: participantsDropdownOpen ? 2000 : 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={labelStyle}>Deltagare</Text>
                          {(editProjectParticipants || []).length > 0 && (
                            <View style={{ marginLeft: 8, backgroundColor: '#2563EB', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{(editProjectParticipants || []).length}</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ position: 'relative', zIndex: participantsDropdownOpen ? 2001 : 1 }} ref={participantsDropdownRef}>
                          <TouchableOpacity
                            style={{
                              ...inputStyleBase,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              ...(participantsDropdownOpen && Platform.OS === 'web' ? {
                                borderColor: '#1976D2',
                                borderBottomLeftRadius: 0,
                                borderBottomRightRadius: 0,
                                boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.1)',
                              } : {}),
                            }}
                            onPress={() => {
                              if (Platform.OS === 'web') {
                                setParticipantsDropdownOpen(!participantsDropdownOpen);
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={{ fontSize: 13, color: (editProjectParticipants || []).length > 0 ? '#111' : '#94A3B8', fontWeight: '700' }} numberOfLines={1}>
                              {(editProjectParticipants || []).length > 0
                                ? `${(editProjectParticipants || []).length} ${(editProjectParticipants || []).length === 1 ? 'deltagare vald' : 'deltagare valda'}`
                                : 'Välj deltagare...'}
                            </Text>
                            <Ionicons
                              name={participantsDropdownOpen ? "chevron-up" : "chevron-down"}
                              size={16}
                              color="#111"
                            />
                          </TouchableOpacity>

                          {Platform.OS === 'web' && participantsDropdownOpen && (
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
                                maxHeight: 750,
                                minHeight: 200,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.15,
                                shadowRadius: 12,
                                elevation: 8,
                                zIndex: 2002,
                                overflow: 'hidden',
                                ...(Platform.OS === 'web' ? {
                                  opacity: 1,
                                  backgroundColor: '#ffffff',
                                } : {}),
                              }}
                            >
                              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#F8FAFC' }}>
                                <View style={{ ...inputStyleBase, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                                  <Ionicons name="search" size={16} color="#64748b" />
                                  <TextInput
                                    value={editProjectParticipantsSearch}
                                    onChangeText={(v) => setEditProjectParticipantsSearch(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                                    placeholder="Sök användare..."
                                    placeholderTextColor="#94A3B8"
                                    style={{ flex: 1, fontSize: 13, color: '#111' }}
                                    autoFocus
                                  />
                                </View>
                              </View>

                              {loadingCompanyMembers ? (
                                <View style={{ padding: 16, alignItems: 'center' }}>
                                  <Text style={{ color: '#64748b', fontSize: 13 }}>Laddar…</Text>
                                </View>
                              ) : companyMembersPermissionDenied ? (
                                <View style={{ padding: 16 }}>
                                  <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '700' }}>Saknar behörighet att läsa användare.</Text>
                                </View>
                              ) : visibleMembers.length === 0 ? (
                                <View style={{ padding: 16 }}>
                                  <Text style={{ color: '#64748b', fontSize: 13 }}>Inga träffar.</Text>
                                </View>
                              ) : (
                                <ScrollView
                                  style={{
                                    flex: 1,
                                    backgroundColor: '#fff',
                                    maxHeight: 670,
                                  }}
                                  contentContainerStyle={{
                                    paddingBottom: 4,
                                  }}
                                  nestedScrollEnabled
                                >
                                  {(() => {
                                    const selectedIds = new Set((editProjectParticipants || []).map(p => p.uid || p.id));
                                    const sorted = [...visibleMembers].sort((a, b) => {
                                      const aSelected = selectedIds.has(a.uid || a.id);
                                      const bSelected = selectedIds.has(b.uid || b.id);
                                      if (aSelected && !bSelected) return -1;
                                      if (!aSelected && bSelected) return 1;
                                      return formatPersonName(a).localeCompare(formatPersonName(b), 'sv');
                                    });
                                    return sorted.slice(0, 200).map((m) => {
                                      const id = m.id || m.uid || m.email;
                                      const selected = selectedIds.has(m.uid || m.id);
                                      return (
                                        <TouchableOpacity
                                          key={id}
                                          onPress={() => {
                                            toggleParticipant(m);
                                          }}
                                          style={{
                                            paddingVertical: 12,
                                            paddingHorizontal: 12,
                                            borderBottomWidth: 1,
                                            borderBottomColor: '#EEF0F3',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 10,
                                            backgroundColor: selected ? '#EFF6FF' : '#fff',
                                            ...(Platform.OS === 'web' ? {
                                              cursor: 'pointer',
                                              transition: 'background-color 0.15s',
                                              opacity: 1,
                                            } : {}),
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <View style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 16,
                                            backgroundColor: selected ? '#2563EB' : '#1E40AF',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                          }}>
                                            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>
                                              {initials(m)}
                                            </Text>
                                          </View>
                                          <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text
                                              numberOfLines={1}
                                              style={{
                                                fontSize: 13,
                                                fontWeight: selected ? '800' : '600',
                                                color: '#111'
                                              }}
                                            >
                                              {formatPersonName(m)}
                                            </Text>
                                            <Text
                                              numberOfLines={1}
                                              style={{
                                                fontSize: 12,
                                                color: '#64748b'
                                              }}
                                            >
                                              {String(m?.role || '').trim() || 'Användare'}
                                            </Text>
                                          </View>
                                          {selected && (
                                            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                                          )}
                                        </TouchableOpacity>
                                      );
                                    });
                                  })()}
                                </ScrollView>
                              )}
                            </View>
                          )}
                        </View>
                      </View>
                    </View>

                    <View style={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E6E8EC', backgroundColor: '#fff', position: 'relative', zIndex: 1 }}>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Status</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <TouchableOpacity
                            style={{
                              flex: 1,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 10,
                              backgroundColor: editableProject?.status !== 'completed' ? '#E8F5E9' : '#fff',
                              borderWidth: editableProject?.status !== 'completed' ? 2 : 1,
                              borderColor: editableProject?.status !== 'completed' ? '#43A047' : '#E2E8F0',
                            }}
                            onPress={() => setEditableProject(p => ({ ...p, status: 'ongoing' }))}
                            activeOpacity={0.8}
                          >
                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#43A047', marginRight: 8 }} />
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>Pågående</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{
                              flex: 1,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 10,
                              backgroundColor: editableProject?.status === 'completed' ? '#F5F5F5' : '#fff',
                              borderWidth: editableProject?.status === 'completed' ? 2 : 1,
                              borderColor: editableProject?.status === 'completed' ? '#222' : '#E2E8F0',
                            }}
                            onPress={() => setEditableProject(p => ({ ...p, status: 'completed' }))}
                            activeOpacity={0.8}
                          >
                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#222', marginRight: 8 }} />
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>Avslutat</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Skyddsronder</Text>
                        {(() => {
                          const firstDueTrim = String(editableProject?.skyddsrondFirstDueDate || '').trim();
                          const isEnabled = editableProject?.skyddsrondEnabled !== false;
                          const isFirstDueValid = (!isEnabled) || (firstDueTrim !== '' && isValidIsoDateYmd(firstDueTrim));
                          return (
                            <View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <Text style={{ fontSize: 13, color: '#111' }}>Aktiva</Text>
                                <Switch
                                  value={isEnabled}
                                  onValueChange={(v) => setEditableProject(p => ({ ...p, skyddsrondEnabled: !!v }))}
                                />
                              </View>

                              <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Veckor mellan skyddsronder</Text>
                              <TouchableOpacity
                                style={{
                                  ...inputStyleBase,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  opacity: isEnabled ? 1 : 0.5,
                                  marginBottom: 10,
                                }}
                                disabled={!isEnabled}
                                onPress={() => setSkyddsrondWeeksPickerVisible(true)}
                                activeOpacity={0.8}
                              >
                                <Text style={{ fontSize: 13, color: '#111', fontWeight: '500' }}>{String(editableProject?.skyddsrondIntervalWeeks || 2)}</Text>
                                <Ionicons name="chevron-down" size={16} color="#111" />
                              </TouchableOpacity>

                              <View style={{ marginBottom: 0 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155' }}>Första skyddsrond senast *</Text>
                                  {isEnabled && isFirstDueValid ? (
                                    <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
                                  ) : null}
                                </View>
                                <TextInput
                                  value={firstDueTrim}
                                  onChangeText={(v) => {
                                    const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                                    setEditableProject(p => ({ ...p, skyddsrondFirstDueDate: String(next) }));
                                  }}
                                  onFocus={() => setFocusedInput('skyddsrondDate')}
                                  onBlur={() => setFocusedInput(null)}
                                  placeholder="YYYY-MM-DD"
                                  placeholderTextColor="#94A3B8"
                                  editable={isEnabled}
                                  style={{
                                    ...inputStyleBase,
                                    ...requiredBorder(
                                      isFirstDueValid || !isEnabled,
                                      focusedInput === 'skyddsrondDate' && isEnabled
                                    ),
                                    ...((!isFirstDueValid && isEnabled) ? { borderColor: '#EF4444' } : {}),
                                    opacity: isEnabled ? 1 : 0.5,
                                  }}
                                />

                                {isEnabled && !isFirstDueValid ? (
                                  <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: 6, fontWeight: '500' }}>
                                    Ange datum (YYYY-MM-DD).
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          );
                        })()}
                      </View>

                      <Modal
                        visible={skyddsrondWeeksPickerVisible}
                        transparent
                        animationType="fade"
                        onRequestClose={() => setSkyddsrondWeeksPickerVisible(false)}
                      >
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.30)' }}>
                          <Pressable
                            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
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
                                  setEditableProject(p => ({ ...p, skyddsrondIntervalWeeks: w }));
                                  setSkyddsrondWeeksPickerVisible(false);
                                }}
                              >
                                <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>{w}</Text>
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

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <TouchableOpacity
                          onPress={() => setEditingInfo(false)}
                          style={{
                            backgroundColor: '#E5E7EB',
                            borderRadius: 10,
                            paddingVertical: 12,
                            paddingHorizontal: 18,
                            minWidth: 110,
                            alignItems: 'center',
                            ...(Platform.OS === 'web' ? {
                              transition: 'background-color 0.2s',
                              cursor: 'pointer',
                            } : {}),
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={{ color: '#111', fontWeight: '800', fontSize: 14 }}>Avbryt</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={async () => {
                            const safeText = (s) => String(s || '').trim();
                            const firstDueTrim = safeText(editableProject?.skyddsrondFirstDueDate);
                            const isEnabled = editableProject?.skyddsrondEnabled !== false;
                            const isFirstDueValid = (!isEnabled) || (firstDueTrim !== '' && isValidIsoDateYmd(firstDueTrim));
                            if (!isFirstDueValid) return;

                            const projectDocId = safeText(project?.id);
                            if (!companyId || !projectDocId) return;

                            const beforePn = safeText(project?.projectNumber) || safeText(project?.number) || safeText(projectDocId);
                            const beforePnm = safeText(project?.projectName) || safeText(project?.name);
                            const afterPn = safeText(editableProject?.projectNumber) || safeText(editableProject?.number) || beforePn;
                            const afterPnm = safeText(editableProject?.projectName) || safeText(editableProject?.name) || beforePnm;
                            const fullName = afterPn && afterPnm ? `${afterPn} - ${afterPnm}` : (afterPnm || afterPn || '');

                            const normalizePn = (v) => String(v || '').trim().toLowerCase();
                            if (normalizePn(afterPn) !== normalizePn(beforePn)) {
                              try {
                                const dup = await hasDuplicateProjectNumber(companyId, afterPn, projectDocId);
                                if (dup) {
                                  setSaveProjectInfoError(`Det finns redan ett projekt med projektnummer ${afterPn}. Projektnummer måste vara unikt.`);
                                  return;
                                }
                              } catch (e) {
                                setSaveProjectInfoError('Kunde inte kontrollera om projektnumret är unikt. Försök igen.');
                                return;
                              }
                            }

                            const sanitizedParticipants = (editProjectParticipants || []).map((p) => ({
                              uid: p.uid || p.id,
                              displayName: p.displayName || null,
                              email: p.email || null,
                              role: p.role || null,
                            }));

                            const street = safeText(editableProject?.address?.street) || safeText(editableProject?.adress);
                            const postalCode = safeText(editableProject?.address?.postalCode);
                            const city = safeText(editableProject?.address?.city);
                            const address = (street || postalCode || city)
                              ? { street: street || null, postalCode: postalCode || null, city: city || null }
                              : null;

                            const patch = {
                              projectNumber: afterPn || null,
                              projectName: afterPnm || null,
                              number: afterPn || null,
                              name: afterPnm || null,
                              fullName,
                              status: safeText(editableProject?.status) || null,
                              phase: safeText(editableProject?.phase) || null,
                              createdAt: editableProject?.createdAt || null,
                              customer: safeText(editableProject?.customer) || safeText(editableProject?.client) || null,
                              client: safeText(editableProject?.customer) || safeText(editableProject?.client) || null,
                              clientContact: editableProject?.clientContact || null,
                              address,
                              adress: street || null,
                              propertyDesignation: safeText(editableProject?.propertyDesignation) || safeText(editableProject?.fastighetsbeteckning) || null,
                              fastighetsbeteckning: safeText(editableProject?.propertyDesignation) || safeText(editableProject?.fastighetsbeteckning) || null,
                              participants: sanitizedParticipants,
                              skyddsrondEnabled: editableProject?.skyddsrondEnabled !== false,
                              skyddsrondIntervalWeeks: Number(editableProject?.skyddsrondIntervalWeeks || 2) || 2,
                              skyddsrondFirstDueDate: (editableProject?.skyddsrondEnabled !== false)
                                ? (firstDueTrim || null)
                                : null,
                            };

                            setSavingProjectInfo(true);
                            setSaveProjectInfoError(null);
                            try {
                              await patchCompanyProject(companyId, projectDocId, patch);
                              const fresh = await fetchCompanyProject(companyId, projectDocId);
                              const normalized = normalizeProject(fresh);

                              setProject(normalized);
                              setEditableProject(normalized);
                              if (typeof navigation?.setParams === 'function') {
                                navigation.setParams({ project: normalized });
                              }
                              emitProjectUpdated({ ...normalized, originalId: originalProjectId });

                              if (beforePn !== afterPn || beforePnm !== afterPnm) {
                                try {
                                  const mergedForSp = { ...(project || {}), ...(normalized || {}) };
                                  void updateSharePointProjectPropertiesFromFirestoreProject(companyId, mergedForSp).catch((e) => {
                                    console.warn('[ProjectDetails] Kunde inte uppdatera SharePoint projektsmetadata (ProjectNumber/ProjectName):', e?.message || e);
                                  });
                                } catch (e) {
                                  console.warn('[ProjectDetails] Kunde inte uppdatera SharePoint projektsmetadata (ProjectNumber/ProjectName):', e?.message || e);
                                }
                              }

                              if (beforePn !== afterPn || beforePnm !== afterPnm) {
                                try {
                                  enqueueFsExcelSync(companyId, projectDocId, { reason: 'project-metadata-updated' });
                                } catch (_e) {}
                              }

                              setEditingInfo(false);
                            } catch (e) {
                              setSaveProjectInfoError(e?.message || 'Kunde inte spara projektinformation.');
                            } finally {
                              setSavingProjectInfo(false);
                            }
                          }}
                          style={{
                            backgroundColor: '#1976D2',
                            borderRadius: 10,
                            paddingVertical: 12,
                            paddingHorizontal: 18,
                            minWidth: 110,
                            alignItems: 'center',
                            opacity: savingProjectInfo ? 0.7 : 1,
                            ...(Platform.OS === 'web' ? {
                              transition: 'background-color 0.2s, transform 0.1s',
                              cursor: 'pointer',
                            } : {}),
                          }}
                          disabled={savingProjectInfo}
                          activeOpacity={0.85}
                        >
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{savingProjectInfo ? 'Sparar…' : 'Spara'}</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        onPress={() => {
                          setEditingInfo(false);
                          if ((controls || []).length === 0) {
                            setShowDeleteModal(true);
                          } else {
                            setShowDeleteWarning(true);
                          }
                        }}
                        style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center' }}
                        activeOpacity={0.85}
                        accessibilityLabel="Arkivera projekt"
                      >
                        <Text style={{ color: '#D32F2F', fontSize: 13, fontWeight: '600' }}>Arkivera projekt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            );
          })()}
        </View>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingVertical: 18, paddingHorizontal: 18, minWidth: 320, maxWidth: 420, maxHeight: '75%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#1976D2', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                <Ionicons name="briefcase-outline" size={16} color="#fff" />
              </View>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: '#222' }}>Projektinformation</Text>
              <TouchableOpacity
                onPress={() => setEditingInfo(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 4, marginLeft: 8 }}
              >
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ alignSelf: 'stretch' }}
              contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Projektnummer</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                  value={editableProject?.projectNumber || editableProject?.number || editableProject?.id || ''}
                  onChangeText={v => setEditableProject(p => ({ ...p, projectNumber: v, number: v }))}
                  placeholder="Ange projektnummer"
                  placeholderTextColor="#bbb"
                  autoCapitalize="none"
                />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Projektnamn</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                  value={editableProject?.projectName || editableProject?.name || ''}
                  onChangeText={v => setEditableProject(p => ({ ...p, projectName: v, name: v }))}
                  placeholder="Ange projektnamn"
                  placeholderTextColor="#bbb"
                  autoCapitalize="words"
                />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Skapad</Text>
                <TouchableOpacity
                  activeOpacity={1}
                  onLongPress={() => setCanEditCreated(true)}
                  delayLongPress={2000}
                >
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: canEditCreated ? '#fff' : '#eee', color: canEditCreated ? '#222' : '#888', pointerEvents: 'none' }}
                    value={editableProject?.createdAt ? new Date(editableProject.createdAt).toLocaleDateString() : ''}
                    editable={false}
                  />
                  {!canEditCreated && (
                    <Text style={{ fontSize: 13, color: '#888', marginTop: 4, textAlign: 'center' }}>
                      Håll in 2 sekunder för att ändra datum
                    </Text>
                  )}
                </TouchableOpacity>
                {canEditCreated && (
                  <Modal visible={canEditCreated} transparent animationType="fade" onRequestClose={() => setCanEditCreated(false)}>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.30)' }}>
                      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, minWidth: 260, maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>Välj nytt skapad-datum</Text>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#1976D2', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fafafa', color: '#222', marginBottom: 12 }}
                          value={editableProject?.createdAt ? new Date(editableProject.createdAt).toISOString().slice(0, 10) : ''}
                          onChangeText={v => {
                            const today = new Date();
                            const inputDate = new Date(v);
                            if (inputDate > today) return;
                            setEditableProject(p => ({ ...p, createdAt: v }));
                          }}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#bbb"
                          keyboardType="numeric"
                        />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <TouchableOpacity
                            style={{ backgroundColor: '#1976D2', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1, marginRight: 8 }}
                            onPress={() => setCanEditCreated(false)}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Spara</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1, marginLeft: 8 }}
                            onPress={() => setCanEditCreated(false)}
                          >
                            <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Modal>
                )}
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Ansvarig</Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setAdminPickerVisible(true)}
                  style={{
                    borderWidth: 1,
                    borderColor: '#e0e0e0',
                    borderRadius: 8,
                    padding: 10,
                    backgroundColor: '#fff',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <Text
                    style={{ fontSize: 15, color: editableProject?.ansvarig ? '#222' : '#bbb', flex: 1 }}
                    numberOfLines={1}
                  >
                    {editableProject?.ansvarig ? formatPersonName(editableProject.ansvarig) : 'Välj ansvarig...'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#888" />
                </TouchableOpacity>

                <Modal
                  visible={adminPickerVisible}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setAdminPickerVisible(false)}
                >
                  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: 280, maxWidth: 360 }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 10, textAlign: 'center' }}>
                        Välj ansvarig
                      </Text>

                      {loadingCompanyAdmins ? (
                        <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8 }}>
                          Laddar...
                        </Text>
                      ) : (companyAdminsError ? (
                        <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                          {companyAdminsError}
                        </Text>
                      ) : (companyAdmins.length === 0 ? (
                        <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                          Inga admins hittades i företaget.
                        </Text>
                      ) : (
                        companyAdmins.length <= 5 ? (
                          <View>
                            {companyAdmins.map((m) => (
                              <TouchableOpacity
                                key={m.id || m.uid || m.email}
                                style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                                onPress={() => {
                                  const uid = m.uid || m.id || null;
                                  const name = formatPersonName(m);
                                  setEditableProject(p => ({
                                    ...(p || {}),
                                    ansvarig: name,
                                    ansvarigId: uid,
                                  }));
                                  setAdminPickerVisible(false);
                                }}
                              >
                                <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                                  {formatPersonName(m)}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : (
                          <ScrollView style={{ maxHeight: 260 }}>
                            {companyAdmins.map((m) => (
                              <TouchableOpacity
                                key={m.id || m.uid || m.email}
                                style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                                onPress={() => {
                                  const uid = m.uid || m.id || null;
                                  const name = formatPersonName(m);
                                  setEditableProject(p => ({
                                    ...(p || {}),
                                    ansvarig: name,
                                    ansvarigId: uid,
                                  }));
                                  setAdminPickerVisible(false);
                                }}
                              >
                                <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                                  {formatPersonName(m)}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )
                      )))}

                      <TouchableOpacity
                        style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                        onPress={() => setAdminPickerVisible(false)}
                      >
                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              </View>

              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Status</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: editableProject?.status !== 'completed' ? '#E8F5E9' : '#fff',
                      borderWidth: editableProject?.status !== 'completed' ? 2 : 1,
                      borderColor: editableProject?.status !== 'completed' ? '#43A047' : '#E2E8F0',
                    }}
                    onPress={() => setEditableProject(p => ({ ...p, status: 'ongoing' }))}
                    activeOpacity={0.8}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#43A047', marginRight: 8 }} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>Pågående</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: editableProject?.status === 'completed' ? '#F5F5F5' : '#fff',
                      borderWidth: editableProject?.status === 'completed' ? 2 : 1,
                      borderColor: editableProject?.status === 'completed' ? '#222' : '#E2E8F0',
                    }}
                    onPress={() => setEditableProject(p => ({ ...p, status: 'completed' }))}
                    activeOpacity={0.8}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#222', marginRight: 8 }} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>Avslutat</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Skyddsronder</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontSize: 13, color: '#111' }}>Aktiva</Text>
                  <Switch
                    value={editableProject?.skyddsrondEnabled !== false}
                    onValueChange={(v) => setEditableProject(p => ({ ...p, skyddsrondEnabled: !!v }))}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setEditingInfo(false)}
                  style={{ backgroundColor: '#E5E7EB', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, minWidth: 110, alignItems: 'center' }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#111', fontWeight: '800', fontSize: 14 }}>Avbryt</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    const safeText = (s) => String(s || '').trim();
                    const projectDocId = safeText(project?.id);
                    if (!companyId || !projectDocId) return;

                    const beforePn = safeText(project?.projectNumber) || safeText(project?.number) || safeText(projectDocId);
                    const beforePnm = safeText(project?.projectName) || safeText(project?.name);
                    const afterPn = safeText(editableProject?.projectNumber) || safeText(editableProject?.number) || beforePn;
                    const afterPnm = safeText(editableProject?.projectName) || safeText(editableProject?.name) || beforePnm;
                    const fullName = afterPn && afterPnm ? `${afterPn} - ${afterPnm}` : (afterPnm || afterPn || '');

                    const normalizePn = (v) => String(v || '').trim().toLowerCase();
                    if (normalizePn(afterPn) !== normalizePn(beforePn)) {
                      try {
                        const dup = await hasDuplicateProjectNumber(companyId, afterPn, projectDocId);
                        if (dup) {
                          setSaveProjectInfoError(`Det finns redan ett projekt med projektnummer ${afterPn}. Projektnummer måste vara unikt.`);
                          return;
                        }
                      } catch (e) {
                        setSaveProjectInfoError('Kunde inte kontrollera om projektnumret är unikt. Försök igen.');
                        return;
                      }
                    }

                    const patch = {
                      projectNumber: afterPn || null,
                      projectName: afterPnm || null,
                      number: afterPn || null,
                      name: afterPnm || null,
                      fullName,
                      status: safeText(editableProject?.status) || null,
                      phase: safeText(editableProject?.phase) || null,
                      createdAt: editableProject?.createdAt || null,
                      customer: safeText(editableProject?.customer) || safeText(editableProject?.client) || null,
                      client: safeText(editableProject?.customer) || safeText(editableProject?.client) || null,
                    };

                    setSavingProjectInfo(true);
                    setSaveProjectInfoError(null);
                    try {
                      await patchCompanyProject(companyId, projectDocId, patch);
                      const fresh = await fetchCompanyProject(companyId, projectDocId);
                      const normalized = normalizeProject(fresh);

                      setProject(normalized);
                      setEditableProject(normalized);
                      if (typeof navigation?.setParams === 'function') {
                        navigation.setParams({ project: normalized });
                      }
                      emitProjectUpdated({ ...normalized, originalId: originalProjectId });

                      if (beforePn !== afterPn || beforePnm !== afterPnm) {
                        try {
                          const mergedForSp = { ...(project || {}), ...(normalized || {}) };
                          void updateSharePointProjectPropertiesFromFirestoreProject(companyId, mergedForSp).catch((e) => {
                            console.warn('[ProjectDetails] Kunde inte uppdatera SharePoint projektsmetadata (ProjectNumber/ProjectName):', e?.message || e);
                          });
                        } catch (e) {
                          console.warn('[ProjectDetails] Kunde inte uppdatera SharePoint projektsmetadata (ProjectNumber/ProjectName):', e?.message || e);
                        }
                      }

                      if (beforePn !== afterPn || beforePnm !== afterPnm) {
                        try {
                          enqueueFsExcelSync(companyId, projectDocId, { reason: 'project-metadata-updated' });
                        } catch (_e) {}
                      }

                      setEditingInfo(false);
                    } catch (e) {
                      setSaveProjectInfoError(e?.message || 'Kunde inte spara projektinformation.');
                    } finally {
                      setSavingProjectInfo(false);
                    }
                  }}
                  style={{ backgroundColor: '#1976D2', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, minWidth: 110, alignItems: 'center', opacity: savingProjectInfo ? 0.7 : 1 }}
                  disabled={savingProjectInfo}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{savingProjectInfo ? 'Sparar…' : 'Spara'}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setEditingInfo(false);
                  if ((controls || []).length === 0) {
                    setShowDeleteModal(true);
                  } else {
                    setShowDeleteWarning(true);
                  }
                }}
                style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center' }}
                activeOpacity={0.85}
                accessibilityLabel="Arkivera projekt"
              >
                <Text style={{ color: '#D32F2F', fontSize: 13, fontWeight: '600' }}>Arkivera projekt</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}
    </Modal>
  );
}
