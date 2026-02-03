import { Text, View } from 'react-native';
import { DEFAULT_PHASE } from '../../features/projects/constants';
import { ProjectTree } from './ProjectTree';

export default function MobileProjectTreeSection({
  loadingHierarchy,
  hierarchy,
  selectedProject,
  projectPhaseKey,
  phaseNavigationLoading,
  selectedProjectFolders,
  isWeb,
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
}) {
  if (loadingHierarchy || hierarchy.length === 0) {
    return (
      <View style={{ flex: 1, paddingHorizontal: 4 }}>
        <Text style={{ color: '#888', fontSize: 16, textAlign: 'center', marginTop: 32 }}>
          Inga mappar eller projekt skapade ännu.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingHorizontal: 4 }}>
      <View style={{ paddingHorizontal: 4 }}>
        {(() => {
          console.log(
            '[HomeScreen] LEFT PANEL RENDER - selectedProject:',
            !!selectedProject,
            'projectPhaseKey:',
            projectPhaseKey,
            'phaseNavigation:',
            !!phaseNavigationLoading,
          );

          if (selectedProject && projectPhaseKey) {
            console.log('[HomeScreen] Project selected, checking phase navigation...');

            if (phaseNavigationLoading) {
              console.log('[HomeScreen] Showing loading state');
              return (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#888', fontSize: 14 }}>Laddar...</Text>
                </View>
              );
            }

            console.log('[HomeScreen] Rendering ProjectTree with SharePoint data for selected project');

            const projectHierarchy = selectedProject
              ? [
                  {
                    id: selectedProject.id,
                    name: selectedProject.name || selectedProject.id,
                    type: 'project',
                    expanded: true,
                    children: selectedProjectFolders.map((folder) => ({
                      ...folder,
                      type: 'projectFunction',
                    })),
                    ...selectedProject,
                  },
                ]
              : [];

            return (
              <ProjectTree
                hierarchy={projectHierarchy}
                selectedProject={selectedProject}
                selectedPhase={projectPhaseKey}
                onSelectProject={(project) => {
                  if (isWeb) {
                    // Should never happen on mobile, but keep behaviour identical
                    navigation.navigate('ProjectDetails', {
                      project,
                      companyId,
                    });
                  } else {
                    navigation.navigate('ProjectDetails', {
                      project: {
                        id: project.id,
                        name: project.name,
                        ansvarig: project.ansvarig || '',
                        adress: project.adress || '',
                        fastighetsbeteckning: project.fastighetsbeteckning || '',
                        client: project.client || '',
                        createdAt: project.createdAt || '',
                        createdBy: project.createdBy || '',
                      },
                      companyId,
                    });
                  }
                }}
                onSelectFunction={handleSelectFunction}
                navigation={navigation}
                companyId={companyId}
              />
            );
          }

          console.log('[HomeScreen] No project selected, showing ProjectTree');

          const filteredHierarchy = hierarchy;

          return (
            <ProjectTree
              hierarchy={filteredHierarchy}
              selectedProject={selectedProject}
                selectedPhase={DEFAULT_PHASE}
              onSelectProject={(project) => {
                if (isWeb) {
                  // Should never happen on mobile, but keep behaviour identical
                  navigation.navigate('ProjectDetails', {
                    project,
                    companyId,
                  });
                } else {
                  navigation.navigate('ProjectDetails', {
                    project: {
                      id: project.id,
                      name: project.name,
                      ansvarig: project.ansvarig || '',
                      adress: project.adress || '',
                      fastighetsbeteckning: project.fastighetsbeteckning || '',
                      client: project.client || '',
                      createdAt: project.createdAt || '',
                      createdBy: project.createdBy || '',
                    },
                    companyId,
                  });
                }
              }}
              onSelectFunction={handleSelectFunction}
              navigation={navigation}
              companyId={companyId}
              onToggleMainFolder={handleToggleMainFolder}
              onToggleSubFolder={handleToggleSubFolder}
              onAddSubFolder={(mainId) => {
                const mainFolder = hierarchy.find((m) => m.id === mainId);
                if (mainFolder && !mainFolder.expanded) {
                  handleToggleMainFolder(mainId);
                }
                setCreatingSubFolderForMainId(mainId);
                setNewSubFolderName('');
              }}
              onAddProject={(subId) => {
                const mainFolder = hierarchy.find((m) => {
                  return (m.children || []).some((sub) => sub.id === subId);
                });
                setSimpleProjectModal({ visible: true, parentSubId: subId, parentMainId: mainFolder?.id || null });
                setNewProjectName('');
                setNewProjectNumber('');
              }}
              onAddMainFolder={() => {
                setIsCreatingMainFolder(true);
                setNewMainFolderName('');
              }}
              onEditMainFolder={(id, name) => {
                mainTimersRef.current = mainTimersRef.current || {};
                spinOnce(mainChevronSpinAnim[id]);
                setIsCreatingMainFolder(true);
                setNewMainFolderName(name || '');
              }}
              onEditSubFolder={(id, name) => {
                subChevronSpinAnim[id] = subChevronSpinAnim[id] || null;
                spinOnce(subChevronSpinAnim[id]);
                setIsCreatingMainFolder(false);
                setNewMainFolderName(name || '');
              }}
              mainChevronSpinAnim={mainChevronSpinAnim}
              subChevronSpinAnim={subChevronSpinAnim}
              mainTimersRef={mainTimersRef}
              spinOnce={spinOnce}
            />
          );
        })()}
      </View>
    </View>
  );
}
