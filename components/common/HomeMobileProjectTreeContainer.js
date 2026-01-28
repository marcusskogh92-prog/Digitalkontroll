import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Modal, Platform, Pressable, Text, TouchableOpacity, View } from 'react-native';
import MobileProjectTreeSection from './MobileProjectTreeSection';

export function HomeMobileProjectTreeContainer({
  // shared state/props
  isWeb,
  loadingHierarchy,
  hierarchy,
  hierarchySafe,
  selectedProjectSafe,
  projectPhaseKeySafe,
  phaseNavigationLoading,
  selectedProjectFoldersSafe,
  navigation,
  companyId,
  projectStatusFilter,
  setProjectStatusFilter,
  handleSelectFunction,
  handleToggleMainFolder,
  handleToggleSubFolder,
  setCreatingSubFolderForMainId,
  setNewSubFolderName,
  setSimpleProjectModal,
  setNewProjectName,
  setNewProjectNumber,
  setNewProjectModal,
  setIsCreatingMainFolder,
  setNewMainFolderName,
  mainChevronSpinAnim,
  subChevronSpinAnim,
  mainTimersRef,
  spinOnce,
  // header helpers
  projektLongPressTimer,
  filterSpinAnim,
  filterRotate,
  searchSpinAnim,
  searchRotate,
  openSearchModal,
}) {
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const projectStatusFilterSafeLocal = projectStatusFilter || 'all';

  const filterOptions = [
    { key: 'all', label: 'Alla' },
    { key: 'ongoing', label: 'Pågående' },
    { key: 'completed', label: 'Avslutade' },
  ];

  return (
    <>
      {/* App-only: filter modal */}
      {Platform.OS !== 'web' && (
        <Modal
          visible={filterModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFilterModalVisible(false)}
        >
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Pressable
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
              onPress={() => setFilterModalVisible(false)}
            />
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 20, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6, position: 'relative' }}>
              <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 14, color: '#222', textAlign: 'center' }}>
                Filtrera projekt
              </Text>

              {filterOptions.map((opt) => {
                const selected = projectStatusFilterSafeLocal === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: selected ? '#1976D2' : '#e0e0e0',
                      backgroundColor: selected ? '#e3f2fd' : '#fff',
                      marginBottom: 10,
                    }}
                    onPress={() => {
                      setProjectStatusFilter(opt.key);
                      setFilterModalVisible(false);
                    }}
                    activeOpacity={0.8}
                  >
                    {opt.key === 'ongoing' && (
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#43A047', marginRight: 10, borderWidth: 1, borderColor: '#bbb' }} />
                    )}
                    {opt.key === 'completed' && (
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#222', marginRight: 10, borderWidth: 1, borderColor: '#bbb' }} />
                    )}
                    {opt.key === 'all' && (
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', marginRight: 10, borderWidth: 1, borderColor: '#bbb' }} />
                    )}
                    <Text style={{ fontSize: 16, fontWeight: selected ? '700' : '600', color: '#222' }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={{ backgroundColor: '#e0e0e0', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Rubrik + filter/sök + träd för mobil */}
      <View style={{ width: '100%', alignItems: 'center', marginTop: 18, paddingHorizontal: 16 }}>
        <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '100%', marginBottom: 12 }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 16 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPressIn={() => {
            if (projektLongPressTimer.current) clearTimeout(projektLongPressTimer.current);
            projektLongPressTimer.current = setTimeout(() => {
              setIsCreatingMainFolder(true);
              setNewMainFolderName('');
            }, 2000);
          }}
          onPressOut={() => {
            if (projektLongPressTimer.current) clearTimeout(projektLongPressTimer.current);
          }}
        >
          <Text style={{ fontSize: 26, fontWeight: '600', color: '#263238', letterSpacing: 0.2, textAlign: 'center' }}>Projekt</Text>
        </TouchableOpacity>
        {Platform.OS !== 'web' && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8 }}
              onPress={() => {
                spinOnce(filterSpinAnim);
                setFilterModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <View style={{ position: 'relative' }}>
                <Animated.View style={{ transform: [{ rotate: filterRotate }] }}>
                  <Ionicons name="filter" size={22} color="#1976D2" />
                </Animated.View>
                {projectStatusFilterSafeLocal !== 'all' && (
                  <View
                    style={{
                      position: 'absolute',
                      right: -1,
                      top: -1,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: projectStatusFilterSafeLocal === 'completed' ? '#222' : '#43A047',
                      borderWidth: 1,
                      borderColor: '#fff',
                    }}
                  />
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8, marginLeft: 10 }}
              onPress={() => {
                spinOnce(searchSpinAnim);
                openSearchModal();
              }}
              activeOpacity={0.7}
            >
              <Animated.View style={{ transform: [{ rotate: searchRotate }] }}>
                <Ionicons name="search" size={22} color="#1976D2" />
              </Animated.View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {!isWeb && (
        <MobileProjectTreeSection
          loadingHierarchy={loadingHierarchy}
          hierarchy={hierarchySafe}
          selectedProject={selectedProjectSafe}
          projectPhaseKey={projectPhaseKeySafe}
          phaseNavigationLoading={phaseNavigationLoading}
          selectedProjectFolders={selectedProjectFoldersSafe}
          isWeb={isWeb}
          navigation={navigation}
          companyId={companyId}
          projectStatusFilter={projectStatusFilterSafeLocal}
          handleSelectFunction={handleSelectFunction}
          handleToggleMainFolder={handleToggleMainFolder}
          handleToggleSubFolder={handleToggleSubFolder}
          setCreatingSubFolderForMainId={setCreatingSubFolderForMainId}
          setNewSubFolderName={setNewSubFolderName}
          setSimpleProjectModal={setSimpleProjectModal}
          setNewProjectName={setNewProjectName}
          setNewProjectNumber={setNewProjectNumber}
          setNewProjectModal={setNewProjectModal}
          setIsCreatingMainFolder={setIsCreatingMainFolder}
          setNewMainFolderName={setNewMainFolderName}
          mainChevronSpinAnim={mainChevronSpinAnim}
          subChevronSpinAnim={subChevronSpinAnim}
          mainTimersRef={mainTimersRef}
          spinOnce={spinOnce}
        />
      )}
    </>
  );
}
