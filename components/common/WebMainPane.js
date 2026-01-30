import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import ProjectDetails from '../../Screens/ProjectDetails';
import TemplateControlScreen from '../../Screens/TemplateControlScreen';
import { Dashboard } from './Dashboard';
import InlineProjectCreationPanel from './InlineProjectCreationPanel';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from './layoutConstants';

export default function WebMainPane(props) {
  const {
    webPaneHeight,
    rightPaneScrollRef,
    activityScrollRef,
    inlineControlEditor,
    closeInlineControlEditor,
    handleInlineControlFinished,
    creatingProjectInline,
    selectedProject,
    auth,
    creatingProject,
    newProjectNumber,
    setNewProjectNumber,
    newProjectName,
    setNewProjectName,
    hierarchy,
    setHierarchy,
    resetProjectFields,
    requestProjectSwitch,
    selectedProjectPath,
    setCreatingProject,
    setCreatingProjectInline,
    setSelectedProject,
    setSelectedProjectPath,
    isProjectNumberUnique,
    projectSelectedAction,
    handleInlineLockChange,
    handleInlineViewChange,
    projectControlsRefreshNonce,
    navigation,
    toggleDashboardFocus,
    closeSelectedProject,
    dashboardFocus,
    setDashboardFocus,
    dashboardDropdownTop,
    setDashboardDropdownTop,
    dashboardHoveredStatKey,
    setDashboardHoveredStatKey,
    dashboardDropdownAnchor,
    dashboardDropdownRowKey,
    setDashboardDropdownRowKey,
    dashboardLoading,
    dashboardOverview,
    dashboardRecentProjects,
    companyActivity,
    dashboardActiveProjectsList,
    dashboardDraftItems,
    dashboardControlsToSignItems,
    dashboardOpenDeviationItems,
    dashboardUpcomingSkyddsrondItems,
    dashboardBtn1Url,
    dashboardBtn2Url,
    dashboardBtn1Failed,
    dashboardBtn2Failed,
    setDashboardBtn1Failed,
    setDashboardBtn2Failed,
    dashboardCardLayoutRef,
    dashboardStatRowLayoutRef,
    formatRelativeTime,
    findProjectById,
    _countProjectStatus,
    companyProfile,
    companyId,
    routeCompanyId,
    rightWidth,
    panResponderRight,
    projectPhaseKey,
    phaseActiveSection,
    phaseActiveItem,
    setPhaseActiveSection,
    setPhaseActiveItem,
    onOpenCreateProjectModal,
  } = props;

  const isWeb = Platform.OS === 'web';
  const PANE_PADDING = 18;

  // Avoid nested vertical ScrollViews on web.
  // ProjectDetails manages its own scrolling.
  const showOuterScroll = !(selectedProject || (inlineControlEditor && inlineControlEditor.project));

  const mainContent = inlineControlEditor && inlineControlEditor.project ? (
    <View style={{ flex: 1, paddingHorizontal: PANE_PADDING, paddingTop: PANE_PADDING, paddingBottom: 0 }}>
      <TemplateControlScreen
        project={inlineControlEditor.project}
        controlType={inlineControlEditor.controlType}
        route={{
          params: {
            templateId: inlineControlEditor.templateId || null,
            companyId,
          },
        }}
        onExit={closeInlineControlEditor}
        onFinished={handleInlineControlFinished}
      />
    </View>
  ) : creatingProjectInline && selectedProject?.isTemporary ? (
    <InlineProjectCreationPanel
      newProjectNumber={newProjectNumber}
      setNewProjectNumber={setNewProjectNumber}
      newProjectName={newProjectName}
      setNewProjectName={setNewProjectName}
      creatingProject={creatingProject}
      auth={auth}
      creatingProjectInline={creatingProjectInline}
      hierarchy={hierarchy}
      setHierarchy={setHierarchy}
      resetProjectFields={resetProjectFields}
      requestProjectSwitch={requestProjectSwitch}
      selectedProjectPath={selectedProjectPath}
      setCreatingProject={setCreatingProject}
      setCreatingProjectInline={setCreatingProjectInline}
      setSelectedProject={setSelectedProject}
      setSelectedProjectPath={setSelectedProjectPath}
      isProjectNumberUnique={isProjectNumberUnique}
    />
  ) : selectedProject ? (
    <View style={{ flex: 1 }}>
      <ProjectDetails
        route={{
          params: {
            project: selectedProject,
            companyId,
            selectedAction: projectSelectedAction,
            onInlineLockChange: handleInlineLockChange,
            onInlineViewChange: handleInlineViewChange,
            phaseActiveSection,
            phaseActiveItem,
            onPhaseSectionChange: setPhaseActiveSection,
            onPhaseItemChange: (sectionId, itemId) => {
              setPhaseActiveSection(sectionId);
              setPhaseActiveItem(itemId);
            },
          },
        }}
        navigation={navigation}
        inlineClose={closeSelectedProject}
        refreshNonce={projectControlsRefreshNonce}
      />
    </View>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: PANE_PADDING, paddingTop: PANE_PADDING, paddingBottom: 0 }}>
      <View style={{ position: 'relative' }}>
        {isWeb && dashboardFocus ? (
          <Pressable
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10,
            }}
            onPress={() => {
              setDashboardFocus(null);
              setDashboardDropdownTop(null);
              setDashboardHoveredStatKey(null);
            }}
          />
        ) : null}

        <Dashboard
          dashboardLoading={dashboardLoading}
          dashboardOverview={dashboardOverview}
          dashboardRecentProjects={dashboardRecentProjects}
          companyActivity={companyActivity}
          dashboardFocus={dashboardFocus}
          dashboardHoveredStatKey={dashboardHoveredStatKey}
          dashboardDropdownAnchor={dashboardDropdownAnchor}
          dashboardDropdownTop={dashboardDropdownTop}
          dashboardDropdownRowKey={dashboardDropdownRowKey}
          dashboardActiveProjectsList={dashboardActiveProjectsList}
          dashboardDraftItems={dashboardDraftItems}
          dashboardControlsToSignItems={dashboardControlsToSignItems}
          dashboardOpenDeviationItems={dashboardOpenDeviationItems}
          dashboardUpcomingSkyddsrondItems={dashboardUpcomingSkyddsrondItems}
          dashboardBtn1Url={dashboardBtn1Url}
          dashboardBtn2Url={dashboardBtn2Url}
          dashboardBtn1Failed={dashboardBtn1Failed}
          dashboardBtn2Failed={dashboardBtn2Failed}
          dashboardCardLayoutRef={dashboardCardLayoutRef}
          dashboardStatRowLayoutRef={dashboardStatRowLayoutRef}
          webPaneHeight={webPaneHeight}
          onProjectSelect={(project) => requestProjectSwitch(project, { selectedAction: null })}
          onDraftSelect={(project, draft) => {
            requestProjectSwitch(project, {
              selectedAction: {
                id: `openDraft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                kind: 'openDraft',
                type: draft?.type || 'Utkast',
                initialValues: draft,
              },
              clearActionAfter: true,
            });
            setDashboardFocus(null);
            setDashboardDropdownTop(null);
            setDashboardHoveredStatKey(null);
          }}
          onControlToSignSelect={(project, control) => {
            requestProjectSwitch(project, {
              selectedAction: {
                id: `openControl-${control?.id || Date.now()}`,
                kind: 'openControlDetails',
                control,
              },
              clearActionAfter: true,
            });
            setDashboardFocus(null);
            setDashboardDropdownTop(null);
            setDashboardHoveredStatKey(null);
          }}
          onDeviationSelect={(project, entry) => {
            requestProjectSwitch(project, {
              selectedAction: {
                id: `openControl-${entry?.control?.id || Date.now()}`,
                kind: 'openControlDetails',
                control: entry.control,
              },
              clearActionAfter: true,
            });
            setDashboardFocus(null);
            setDashboardDropdownTop(null);
            setDashboardHoveredStatKey(null);
          }}
          onSkyddsrondSelect={(project) => {
            requestProjectSwitch(project, { selectedAction: null });
            setDashboardFocus(null);
            setDashboardDropdownTop(null);
            setDashboardHoveredStatKey(null);
          }}
          onToggleDashboardFocus={toggleDashboardFocus}
          onDashboardHover={setDashboardHoveredStatKey}
          formatRelativeTime={formatRelativeTime}
          findProjectById={findProjectById}
          hierarchy={hierarchy}
          _countProjectStatus={_countProjectStatus}
          setDashboardBtn1Failed={setDashboardBtn1Failed}
          setDashboardBtn2Failed={setDashboardBtn2Failed}
          setDashboardDropdownRowKey={setDashboardDropdownRowKey}
          companyName={companyProfile?.companyName || companyProfile?.name || companyId || null}
          companyId={companyId || routeCompanyId}
          currentUserId={auth?.currentUser?.uid || null}
          onCreateProject={onOpenCreateProjectModal}
        />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: 'row', minWidth: 0, minHeight: 0 }}>
      <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        {showOuterScroll ? (
          <ScrollView
            ref={rightPaneScrollRef}
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER }}
          >
            {mainContent}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, minWidth: 0 }}>
            {mainContent}
          </View>
        )}

      </View>

      {!selectedProject || !projectPhaseKey ? (
        <View
          style={{
            width: rightWidth,
            minWidth: 340,
            maxWidth: 520,
            padding: 18,
            borderLeftWidth: 1,
            borderLeftColor: '#e6e6e6',
            backgroundColor: '#F7FAFC',
            position: 'relative',
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: '#e6e6e6',
            }}
          />
          <View
            {...(panResponderRight && panResponderRight.panHandlers)}
            style={
              isWeb
                ? {
                    position: 'absolute',
                    left: -8,
                    top: 0,
                    bottom: 0,
                    width: 16,
                    cursor: 'col-resize',
                    zIndex: 9,
                    pointerEvents: 'auto',
                  }
                : {
                    position: 'absolute',
                    left: -12,
                    top: 0,
                    bottom: 0,
                    width: 24,
                    zIndex: 9,
                  }
            }
          />
          <ScrollView
            ref={activityScrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER }}
            scrollEnabled
            nestedScrollEnabled
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                Notiser och händelser
              </Text>
              <Text style={{ fontSize: 13, color: '#777' }}>
                Här kommer vi senare visa notiser och händelser från projekt du är med i.
              </Text>
            </View>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
