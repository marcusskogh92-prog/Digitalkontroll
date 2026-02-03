import { Ionicons } from '@expo/vector-icons';
import { Animated, Platform, Text, TouchableOpacity, View } from 'react-native';
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
  return (
    <>
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
