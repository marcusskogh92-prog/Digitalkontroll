import { Ionicons } from '@expo/vector-icons';
import { Animated, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ContextMenu from '../ContextMenu';
import { ProjectTree } from './ProjectTree';

function RecursiveFolderView({
  folder,
  level = 0,
  expandedSubs,
  spinSubs,
  onToggle,
  companyId,
  hierarchy,
  setHierarchy,
  parentPath = '',
}) {
  if (!folder) return null;

  const safeName = folder.name || folder.id || '';
  const fontSize = Math.max(12, 15 - level);
  const marginLeft = 12 + level * 8;

  return (
    <View style={{ marginLeft, marginTop: 4 }}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2, paddingHorizontal: 4 }}
        onPress={() => {
          if (onToggle) onToggle(folder.id);
        }}
      >
        <Ionicons
          name={expandedSubs?.[folder.id] ? 'chevron-down' : 'chevron-forward'}
          size={Math.max(12, 16 - level)}
          color="#222"
          style={{ marginRight: 4 }}
        />
        <Text style={{ fontSize, color: '#222' }}>{safeName}</Text>
      </TouchableOpacity>

      {expandedSubs?.[folder.id] && Array.isArray(folder.children) && folder.children.length > 0 && (
        <View style={{ marginLeft: 8, marginTop: 2 }}>
          {folder.children
            .filter(child => child && (child.type === 'folder' || !child.type))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
            .map(child => (
              <RecursiveFolderView
                key={child.id || `${safeName}-${level}`}
                folder={child}
                level={level + 1}
                expandedSubs={expandedSubs}
                spinSubs={spinSubs}
                onToggle={onToggle}
                companyId={companyId}
                hierarchy={hierarchy}
                setHierarchy={setHierarchy}
                parentPath={parentPath}
              />
            ))}
        </View>
      )}
    </View>
  );
}

export function SharePointLeftPanel({
  leftWidth,
  webPaneHeight,
  panResponder,
  spinSidebarHome,
  spinSidebarRefresh,
  onPressHome,
  onPressRefresh,
  leftTreeScrollRef,
  selectedProject,
  projectPhaseKey,
  phaseNavigation,
  phaseNavigationLoading,
  selectedProjectFolders,
  navigation,
  companyId,
  handleSelectFunction,
  projectStatusFilter,
  loadingHierarchy,
  phaseChangeSpinAnim,
  hierarchy,
  expandedSubs,
  spinSub,
  handleToggleSubFolder,
  setHierarchy,
  contextMenu,
  contextMenuItems,
  handleContextMenuSelect,
  closeContextMenu,
  syncStatus,
  appVersion,
  buildStamp,
  scrollToEndSafe,
  createPortal,
}) {
  const isWeb = Platform.OS === 'web';

  return (
    <>
      <View
        style={{
          width: leftWidth,
          padding: 8,
          borderRightWidth: 0,
          borderColor: '#e6e6e6',
          backgroundColor: '#f5f6f7',
          height: webPaneHeight,
          position: 'relative',
        }}
      >
        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#e6e6e6' }} />
        <View
          {...(panResponder && panResponder.panHandlers)}
          style={
            isWeb
              ? {
                  position: 'absolute',
                  right: -8,
                  top: 0,
                  bottom: 0,
                  width: 16,
                  cursor: 'col-resize',
                  zIndex: 9,
                  pointerEvents: 'auto',
                }
              : {
                  position: 'absolute',
                  right: -12,
                  top: 0,
                  bottom: 0,
                  width: 24,
                  zIndex: 9,
                }
          }
        />

        <View
          style={{
            paddingVertical: 8,
            paddingHorizontal: 6,
            borderBottomWidth: 1,
            borderColor: '#e0e0e0',
            marginBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8, marginRight: 6 }}
              onPress={onPressHome}
              activeOpacity={0.7}
              accessibilityLabel="Hem"
            >
              <Ionicons
                name="home-outline"
                size={18}
                color="#1976D2"
                style={{
                  transform: [{ rotate: `${spinSidebarHome * 360}deg` }],
                  transitionProperty: 'transform',
                  transitionDuration: '0.4s',
                  transitionTimingFunction: 'ease',
                }}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8, marginRight: 6 }}
              onPress={onPressRefresh}
              activeOpacity={0.7}
              accessibilityLabel="Uppdatera"
            >
              <Ionicons
                name="refresh"
                size={18}
                color="#1976D2"
                style={{
                  transform: [{ rotate: `${spinSidebarRefresh * 360}deg` }],
                  transitionProperty: 'transform',
                  transitionDuration: '0.4s',
                  transitionTimingFunction: 'ease',
                }}
              />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={leftTreeScrollRef}
          style={{ flex: 1 }}
          scrollEnabled
          nestedScrollEnabled
        >
          {(() => {
            if (selectedProject && projectPhaseKey) {
              if (phaseNavigationLoading) {
                return (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: '#888', fontSize: 14 }}>Laddar...</Text>
                  </View>
                );
              }

              const projectHierarchy = selectedProject
                ? [
                    {
                      id: selectedProject.id,
                      name: selectedProject.name || selectedProject.id,
                      type: 'project',
                      expanded: true,
                      children: selectedProjectFolders.map(folder => ({
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
                  onSelectProject={project => {
                    if (isWeb) {
                      // On web, keep navigation inline
                      // The caller is responsible for updating selectedProject
                      if (project && project.id) {
                        // noop here; HomeScreen handles selection via requestProjectSwitch
                      }
                    } else {
                      navigation.navigate('ProjectDetails', {
                        project: {
                          id: project.id,
                          name: project.name,
                          ansvarig: project.ansvarig || '',
                          adress: project.adress || '',
                          fastighetsbeteckning: project.fastighetsbeteckning || '',
                          client: project.client || '',
                          status: project.status || 'ongoing',
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
                  projectStatusFilter={projectStatusFilter}
                />
              );
            }

            if (loadingHierarchy) {
              const spin = phaseChangeSpinAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg'],
              });
              return (
                <View
                  style={{
                    padding: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 200,
                  }}
                >
                  <View style={{ alignItems: 'center' }}>
                    <Animated.View
                      style={{
                        width: 32,
                        height: 32,
                        borderWidth: 3,
                        borderColor: '#e0e0e0',
                        borderTopColor: '#1976D2',
                        borderRadius: 16,
                        transform: [{ rotate: spin }],
                      }}
                    />
                    <Text
                      style={{
                        color: '#888',
                        fontSize: 14,
                        marginTop: 16,
                        textAlign: 'center',
                      }}
                    >
                      Laddar projektstruktur...
                    </Text>
                  </View>
                </View>
              );
            }

            const filteredHierarchy = hierarchy || [];
            if (!filteredHierarchy.length) {
              return (
                <View
                  style={{ paddingHorizontal: 4 }}
                  nativeID={isWeb ? 'dk-tree-root' : undefined}
                >
                  <Text
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 4,
                      color: '#666',
                      fontSize: 14,
                    }}
                  >
                    Inga mappar hittades. Skapa projektstruktur i SharePoint och uppdatera.
                  </Text>
                </View>
              );
            }

            return (
              <View
                style={{ paddingHorizontal: 4 }}
                nativeID={isWeb ? 'dk-tree-root' : undefined}
              >
                {filteredHierarchy
                  .filter(folder => folder.type === 'folder' || !folder.type)
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                  .map(folder => (
                    <RecursiveFolderView
                      key={folder.id}
                      folder={folder}
                      level={0}
                      expandedSubs={expandedSubs}
                      spinSubs={spinSub}
                      onToggle={handleToggleSubFolder}
                      companyId={companyId}
                      hierarchy={hierarchy}
                      setHierarchy={setHierarchy}
                      parentPath=""
                    />
                  ))}
              </View>
            );
          })()}
        </ScrollView>

        {isWeb && (
          <ContextMenu
            visible={contextMenu.visible}
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenuItems}
            onSelect={handleContextMenuSelect}
            onClose={closeContextMenu}
          />
        )}

        {!selectedProject && isWeb && createPortal && typeof document !== 'undefined'
          ? (() => {
              try {
                let footerRoot = document.getElementById('dk-footer-portal');
                if (!footerRoot) {
                  footerRoot = document.createElement('div');
                  footerRoot.id = 'dk-footer-portal';
                  document.body.appendChild(footerRoot);
                }

                const FooterBox = (
                  <View
                    style={{
                      position: 'fixed',
                      left: 12,
                      bottom: 12,
                      zIndex: 2147483647,
                      pointerEvents: 'auto',
                      backgroundColor: 'rgba(255,255,255,0.96)',
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#e6e6e6',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.12,
                      shadowRadius: 12,
                      elevation: 12,
                      ...(isWeb
                        ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' }
                        : {}),
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>
                        Version: {appVersion}
                      </Text>
                    </View>
                  </View>
                );

                return createPortal(FooterBox, footerRoot);
              } catch (_e) {
                return (
                  <View
                    style={{
                      position: 'absolute',
                      left: 8,
                      bottom: 8,
                      zIndex: 9999,
                      pointerEvents: 'auto',
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#e6e6e6',
                      elevation: 8,
                      ...(isWeb
                        ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' }
                        : {}),
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>
                        Version: {appVersion}
                        {buildStamp ? ` (${buildStamp})` : ''}
                      </Text>
                    </View>
                  </View>
                );
              }
            })()
          : null}
      </View>

      {isWeb && (
        <TouchableOpacity
          onPress={() => scrollToEndSafe(leftTreeScrollRef)}
          activeOpacity={0.85}
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            zIndex: 20,
            backgroundColor: '#fff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#e0e0e0',
            padding: 6,
          }}
        >
          <Ionicons name="chevron-down" size={18} color="#222" />
        </TouchableOpacity>
      )}
    </>
  );
}
