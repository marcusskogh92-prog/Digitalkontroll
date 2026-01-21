import { Ionicons } from '@expo/vector-icons';
import { Animated, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SelectProjectModal } from './Modals';

export function HomeTasksSection({
  controlTypeOptions,
  companyProfile,
  tasksOpen,
  setTasksOpen,
  controlsOpen,
  setControlsOpen,
  mainChevronSpinAnim,
  spinOnce,
  AnimatedRow,
  selectProjectModal,
  setSelectProjectModal,
  showControlTypeModal,
  setShowControlTypeModal,
  controlTypeScrollMetrics,
  setControlTypeScrollMetrics,
  controlTypeCanScroll,
  controlTypeThumbHeight,
  controlTypeThumbTop,
  projectControlModal,
  setProjectControlModal,
  projectControlSelectedType,
  setProjectControlSelectedType,
  projectControlTypePickerOpen,
  setProjectControlTypePickerOpen,
  projectControlTemplates,
  setProjectControlTemplates,
  projectControlSelectedTemplateId,
  setProjectControlSelectedTemplateId,
  projectControlTemplatePickerOpen,
  setProjectControlTemplatePickerOpen,
  projectControlTemplateSearch,
  setProjectControlTemplateSearch,
  projectControlTemplatesList,
  hierarchy,
  searchText,
  setSearchText,
  openInlineControlEditor,
}) {
  const controlTypeThumbHeightValue = controlTypeThumbHeight;
  const controlTypeThumbTopValue = controlTypeThumbTop;

  return (
    <View
      style={
        Platform.OS === 'web'
          ? { marginTop: 18, marginBottom: 16, alignItems: 'flex-start', paddingHorizontal: 16 }
          : { marginTop: 18, marginBottom: 16, alignItems: 'flex-start', paddingHorizontal: 16, width: '100%' }
      }
    >
      {Platform.OS === 'web' ? (
        <View>
          <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '100%', marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            {controlTypeOptions.map(({ type, icon, color }) => (
              <TouchableOpacity
                key={type}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  marginRight: 10,
                  marginBottom: 10,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                  elevation: 2,
                  cursor: 'pointer',
                }}
                onPress={() => {
                  setSelectProjectModal({ visible: true, type });
                  setShowControlTypeModal(false);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name={icon} size={18} color={color} style={{ marginRight: 10 }} />
                <Text style={{ color: '#222', fontWeight: '600', fontSize: 15 }}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View>
          <View style={{ width: '100%', marginBottom: 6 }}>
            <View
              style={{
                width: '100%',
                backgroundColor: '#fff',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#e0e0e0',
                overflow: 'hidden',
                shadowColor: '#222',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 4,
                elevation: 1,
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  try {
                    if (!mainChevronSpinAnim.tasks) mainChevronSpinAnim.tasks = new Animated.Value(0);
                    spinOnce(mainChevronSpinAnim.tasks);
                  } catch (_) {}
                  setTasksOpen(prev => {
                    const next = !prev;
                    if (next) setControlsOpen(false);
                    return next;
                  });
                }}
                activeOpacity={0.85}
                style={{
                  width: '100%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  minHeight: 44,
                }}
              >
                <Animated.View
                  style={
                    mainChevronSpinAnim.tasks
                      ? {
                          transform: [
                            {
                              rotate: mainChevronSpinAnim.tasks.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0deg', '360deg'],
                              }),
                            },
                          ],
                        }
                      : undefined
                  }
                >
                  <Ionicons name={tasksOpen ? 'chevron-down' : 'chevron-forward'} size={22} color="#222" />
                </Animated.View>
                <Text style={{ color: '#222', fontWeight: '700', fontSize: 16, marginLeft: 8, flex: 1 }}>{'Uppgifter'}</Text>
              </TouchableOpacity>

              {tasksOpen ? (
                <View>
                  {[
                    { key: 'task1', label: 'Uppgift 1', icon: 'list-outline', color: '#1976D2' },
                    { key: 'task2', label: 'Uppgift 2', icon: 'time-outline', color: '#00897B' },
                    { key: 'task3', label: 'Uppgift 3', icon: 'checkmark-circle-outline', color: '#7B1FA2' },
                  ].map(btn => (
                    <AnimatedRow
                      key={btn.key}
                      style={{
                        backgroundColor: '#fff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        paddingVertical: 12,
                        paddingLeft: 28,
                        paddingRight: 18,
                        borderTopWidth: 1,
                        borderColor: '#e0e0e0',
                        minHeight: 44,
                        width: '100%',
                      }}
                      onPress={() => {}}
                    >
                      <Ionicons name={btn.icon} size={18} color={btn.color} style={{ marginRight: 14 }} />
                      <Text style={{ color: '#222', fontWeight: '600', fontSize: 15, letterSpacing: 0.2 }}>{btn.label}</Text>
                    </AnimatedRow>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ width: '100%', marginTop: 4, marginBottom: 6, alignSelf: 'stretch' }}>
            <View
              style={{
                width: '100%',
                backgroundColor: '#fff',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#e0e0e0',
                overflow: 'hidden',
                shadowColor: '#222',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 4,
                elevation: 1,
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  try {
                    if (!mainChevronSpinAnim.controls) mainChevronSpinAnim.controls = new Animated.Value(0);
                    spinOnce(mainChevronSpinAnim.controls);
                  } catch (_) {}
                  setControlsOpen(prev => {
                    const next = !prev;
                    if (next) setTasksOpen(false);
                    return next;
                  });
                }}
                activeOpacity={0.85}
                style={{
                  width: '100%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  minHeight: 44,
                }}
              >
                <Animated.View
                  style={
                    mainChevronSpinAnim.controls
                      ? {
                          transform: [
                            {
                              rotate: mainChevronSpinAnim.controls.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0deg', '360deg'],
                              }),
                            },
                          ],
                        }
                      : undefined
                  }
                >
                  <Ionicons name={controlsOpen ? 'chevron-down' : 'chevron-forward'} size={22} color="#222" />
                </Animated.View>
                <Text style={{ color: '#222', fontWeight: '700', fontSize: 16, marginLeft: 8, flex: 1 }}>{'Skapa kontroll'}</Text>
              </TouchableOpacity>

              {controlsOpen ? (
                <View>
                  <AnimatedRow
                    onPress={() => setShowControlTypeModal(true)}
                    style={{
                      backgroundColor: '#fff',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingVertical: 12,
                      paddingLeft: 18,
                      paddingRight: 18,
                      borderTopWidth: 1,
                      borderColor: '#e0e0e0',
                      minHeight: 44,
                      width: '100%',
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: '#1976D2',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Ionicons name="add" size={16} color="#fff" />
                    </View>
                    <Text style={{ color: '#222', fontWeight: '600', fontSize: 15, letterSpacing: 0.5 }}>
                      Skapa ny kontroll
                    </Text>
                  </AnimatedRow>

                  {[1, 2, 3, 4].map(n => (
                    <AnimatedRow
                      key={`valfri-${n}`}
                      style={{
                        backgroundColor: '#fff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        paddingVertical: 12,
                        paddingLeft: 28,
                        paddingRight: 18,
                        borderTopWidth: 1,
                        borderColor: '#e0e0e0',
                        minHeight: 44,
                        width: '100%',
                      }}
                      onPress={() => {}}
                    >
                      <Ionicons name="square-outline" size={18} color="#78909C" style={{ marginRight: 14 }} />
                      <Text style={{ color: '#222', fontWeight: '600', fontSize: 15 }}>{`Valfri ${n}`}</Text>
                    </AnimatedRow>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      )}

      <Modal
        visible={showControlTypeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowControlTypeModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.25)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 18,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 18,
              paddingVertical: 20,
              paddingHorizontal: 20,
              width: 340,
              maxWidth: '90%',
              maxHeight: '60%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: '600',
                marginBottom: 8,
                color: '#222',
                textAlign: 'center',
                marginTop: 6,
              }}
            >
              Välj kontrolltyp
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <ScrollView
                style={{ maxHeight: 320, flex: 1 }}
                showsVerticalScrollIndicator
                onLayout={e => {
                  const h = e?.nativeEvent?.layout?.height || 0;
                  setControlTypeScrollMetrics(prev => ({ ...prev, containerHeight: h }));
                }}
                onContentSizeChange={(w, h) => {
                  setControlTypeScrollMetrics(prev => ({ ...prev, contentHeight: h || 0 }));
                }}
                onScroll={e => {
                  const y = e?.nativeEvent?.contentOffset?.y || 0;
                  setControlTypeScrollMetrics(prev => ({ ...prev, scrollY: y }));
                }}
                scrollEventThrottle={16}
              >
                {controlTypeOptions.map(({ type, icon, color }) => (
                  <TouchableOpacity
                    key={type}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 8,
                      borderRadius: 8,
                      marginBottom: 8,
                      backgroundColor: '#f5f5f5',
                      borderWidth: 1,
                      borderColor: '#e0e0e0',
                    }}
                    onPress={() => {
                      setSelectProjectModal({ visible: true, type });
                      setShowControlTypeModal(false);
                    }}
                  >
                    <Ionicons name={icon} size={22} color={color} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>{type}</Text>
                  </TouchableOpacity>
                ))}
                {Array.isArray(companyProfile?.enabledControlTypes) && controlTypeOptions.length === 0 ? (
                  <Text style={{ color: '#D32F2F', textAlign: 'center', marginTop: 6, marginBottom: 8 }}>
                    Inga kontrolltyper är aktiverade för företaget.
                  </Text>
                ) : null}
              </ScrollView>
              {controlTypeCanScroll ? (
                <View
                  style={{
                    pointerEvents: 'none',
                    width: 3,
                    marginLeft: 6,
                    borderRadius: 999,
                    backgroundColor: '#E0E0E0',
                    height: controlTypeScrollMetrics.containerHeight || 0,
                    overflow: 'hidden',
                    alignSelf: 'flex-start',
                    marginTop: 2,
                  }}
                >
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      borderRadius: 999,
                      backgroundColor: '#B0B0B0',
                      height: controlTypeThumbHeightValue,
                      top: controlTypeThumbTopValue,
                    }}
                  />
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={{ marginTop: 8, alignSelf: 'center' }}
              onPress={() => setShowControlTypeModal(false)}
            >
              <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={projectControlModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setProjectControlModal({ visible: false, project: null });
          setProjectControlSelectedType('');
          setProjectControlTypePickerOpen(false);
          setProjectControlSelectedTemplateId('');
          setProjectControlTemplatePickerOpen(false);
          setProjectControlTemplateSearch('');
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.25)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 18,
              padding: 24,
              width: 340,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4, color: '#222', textAlign: 'center' }}>
              Skapa ny kontroll
            </Text>
            {projectControlModal.project && (
              <Text style={{ fontSize: 14, color: '#555', marginBottom: 14, textAlign: 'center' }}>
                {projectControlModal.project.id} - {projectControlModal.project.name}
              </Text>
            )}
            <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Kontrolltyp</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setProjectControlTypePickerOpen(o => !o)}
              style={{
                borderWidth: 1,
                borderColor: '#ddd',
                borderRadius: 8,
                paddingVertical: 8,
                paddingHorizontal: 10,
                backgroundColor: '#fff',
                marginBottom: 4,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                  {(() => {
                    const meta = controlTypeOptions.find(o => o.type === projectControlSelectedType) || null;
                    if (!meta) return null;
                    return (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          backgroundColor: meta.color || '#00897B',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          marginRight: 8,
                        }}
                      >
                        <Ionicons name={meta.icon} size={14} color="#fff" />
                      </View>
                    );
                  })()}
                  <Text
                    style={{ fontSize: 14, fontWeight: '600', color: '#222', flexShrink: 1 }}
                    numberOfLines={1}
                  >
                    {projectControlSelectedType || 'Välj kontrolltyp'}
                  </Text>
                </View>
                <Ionicons
                  name={projectControlTypePickerOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#555"
                />
              </View>
            </TouchableOpacity>
            {projectControlTypePickerOpen && controlTypeOptions.length > 0 && (
              <View
                style={{
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: '#ddd',
                  borderRadius: 8,
                  backgroundColor: '#fff',
                  maxHeight: 220,
                  overflow: 'auto',
                }}
              >
                {controlTypeOptions.map(({ type, icon, color }) => {
                  const selected = type === projectControlSelectedType;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => {
                        setProjectControlSelectedType(type);
                        setProjectControlTypePickerOpen(false);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        backgroundColor: selected ? '#E0F2F1' : '#fff',
                        borderBottomWidth: 1,
                        borderBottomColor: '#eee',
                      }}
                    >
                      <Ionicons name={icon} size={18} color={color} style={{ marginRight: 10 }} />
                      <Text style={{ fontSize: 14, color: '#263238' }}>{type}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {Array.isArray(companyProfile?.enabledControlTypes) && controlTypeOptions.length === 0 ? (
              <Text style={{ color: '#D32F2F', textAlign: 'center', marginTop: 6, marginBottom: 8 }}>
                Inga kontrolltyper är aktiverade för företaget.
              </Text>
            ) : null}
            {(() => {
              const ct = String(projectControlSelectedType || '').trim();
              const allTemplates = Array.isArray(projectControlTemplates) ? projectControlTemplates : [];
              const baseForType = ct
                ? allTemplates.filter(t => String(t.controlType || '').trim() === ct)
                : [];
              if (!ct || baseForType.length === 0) return null;

              let filtered = baseForType;
              const q = String(projectControlTemplateSearch || '').trim().toLowerCase();
              if (q) {
                filtered = filtered.filter(t => {
                  const title = String(t.title || '').toLowerCase();
                  const desc = String(t.description || '').toLowerCase();
                  const v = t.version != null ? String(t.version).toLowerCase() : '';
                  return title.includes(q) || desc.includes(q) || v.includes(q);
                });
              }
              const selectedTemplate =
                baseForType.find(t => String(t.id) === String(projectControlSelectedTemplateId)) || null;
              const selectedLabel = selectedTemplate?.title || 'Välj mall';
              return (
                <>
                  <Text style={{ fontSize: 13, color: '#555', marginBottom: 6, marginTop: 10 }}>Mall</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setProjectControlTemplatePickerOpen(o => !o)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#ddd',
                      borderRadius: 8,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      backgroundColor: '#fff',
                      marginBottom: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text
                        style={{ fontSize: 14, fontWeight: '600', color: '#222', flexShrink: 1 }}
                        numberOfLines={1}
                      >
                        {selectedLabel}
                      </Text>
                      <Ionicons
                        name={projectControlTemplatePickerOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#555"
                      />
                    </View>
                  </TouchableOpacity>
                  {projectControlTemplatePickerOpen && (
                    <View
                      style={{
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: '#ddd',
                        borderRadius: 8,
                        backgroundColor: '#fff',
                        maxHeight: 220,
                        overflow: 'auto',
                      }}
                    >
                      <TextInput
                        placeholder="S1k mall"
                        value={projectControlTemplateSearch}
                        onChangeText={setProjectControlTemplateSearch}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: '#eee',
                          fontSize: 13,
                        }}
                      />
                      {filtered.length === 0 ? (
                        <Text
                          style={{
                            paddingVertical: 6,
                            paddingHorizontal: 8,
                            fontSize: 12,
                            color: '#78909C',
                          }}
                        >
                          Inga mallar hittades f1r din s1kning.
                        </Text>
                      ) : (
                        filtered.map(tpl => {
                          const selected = String(tpl.id) === String(projectControlSelectedTemplateId);
                          const title = tpl.title || 'Namnl1s mall';
                          const v = tpl.version != null ? String(tpl.version) : '';
                          const versionLabel = v ? `v${v}` : '';
                          return (
                            <TouchableOpacity
                              key={tpl.id}
                              onPress={() => {
                                setProjectControlSelectedTemplateId(String(tpl.id));
                                setProjectControlTemplatePickerOpen(false);
                              }}
                              style={{
                                paddingVertical: 5,
                                paddingHorizontal: 8,
                                backgroundColor: selected ? '#E3F2FD' : '#fff',
                                borderBottomWidth: 1,
                                borderBottomColor: '#eee',
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <Text
                                  style={{ fontSize: 13, color: '#263238', flexShrink: 1 }}
                                  numberOfLines={1}
                                >
                                  {title}
                                </Text>
                                {!!versionLabel && (
                                  <Text
                                    style={{ fontSize: 11, color: '#78909C', marginLeft: 6 }}
                                    numberOfLines={1}
                                  >
                                    {versionLabel}
                                  </Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  )}
                </>
              );
            })()}
            <TouchableOpacity
              disabled={!projectControlSelectedType}
              style={{
                marginTop: 6,
                marginBottom: 4,
                alignSelf: 'stretch',
                backgroundColor: projectControlSelectedType ? '#1976D2' : '#B0BEC5',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
              onPress={() => {
                if (!projectControlSelectedType) return;
                const proj = projectControlModal.project;
                setProjectControlModal({ visible: false, project: null });
                setProjectControlTypePickerOpen(false);
                if (proj) {
                  const ct = projectControlSelectedType;
                  const tplId = projectControlSelectedTemplateId || null;
                  openInlineControlEditor(proj, ct, tplId);
                }
              }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Skapa kontroll</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ marginTop: 8, alignSelf: 'center' }}
              onPress={() => {
                setProjectControlModal({ visible: false, project: null });
                setProjectControlSelectedType('');
                setProjectControlTypePickerOpen(false);
              }}
            >
              <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SelectProjectModal
        visible={selectProjectModal.visible}
        type={selectProjectModal.type}
        hierarchy={hierarchy}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        onClose={() => setSelectProjectModal({ visible: false, type: null })}
        onSelectProject={(project, type) => {
          if (type) {
            openInlineControlEditor(project, type);
          }
        }}
      />
    </View>
  );
}
