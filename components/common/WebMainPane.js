import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import FFUAISummaryView from '../../Screens/FFUAISummaryView';
import ProjectDetails from '../../Screens/ProjectDetails';
import TemplateControlScreen from '../../Screens/TemplateControlScreen';
import OfferterLayout from '../../features/offerter/OfferterLayout';
import { Dashboard } from './Dashboard';
import InlineProjectCreationPanel from './InlineProjectCreationPanel';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from './layoutConstants';

export default function WebMainPane(props) {
  const {
    authClaims,
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
    openProject,
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
    phaseActiveSection,
    phaseActiveItem,
    phaseActiveNode,
    setPhaseActiveSection,
    setPhaseActiveItem,
    setPhaseActiveNode,
    onOpenCreateProjectModal,

    // AF-only explorer state (shared with left panel mirror)
    afRelativePath,
    setAfRelativePath,
    afSelectedItemId,
    setAfSelectedItemId,
    bumpAfMirrorRefreshNonce,

    // Project module routing (web)
    projectModuleRoute,
  } = props;

  const isWeb = Platform.OS === 'web';
  const effectiveCompanyId = String(companyId ?? routeCompanyId ?? authClaims?.companyId ?? '').trim();
  const PANE_PADDING = 18;

  // Avoid nested vertical ScrollViews on web.
  // ProjectDetails manages its own scrolling.
  const showOuterScroll = !(selectedProject || (inlineControlEditor && inlineControlEditor.project));

  const isOfferterModule = String(projectModuleRoute?.moduleId || '') === 'offerter';
  const offerterActiveItemId = String(projectModuleRoute?.itemId || '').trim() || 'forfragningar';
  const isFfuAiSummaryModule = String(projectModuleRoute?.moduleId || '') === 'ffu-ai-summary';

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
  ) : selectedProject && isOfferterModule ? (
    <View style={{ flex: 1 }}>
      <OfferterLayout
        companyId={companyId}
        projectId={selectedProject?.id}
        project={selectedProject}
        activeItemId={offerterActiveItemId}
      />
    </View>
  ) : selectedProject && isFfuAiSummaryModule ? (
    <View style={{ flex: 1, paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER }}>
      <FFUAISummaryView projectId={selectedProject?.id} companyId={effectiveCompanyId} project={selectedProject} />
    </View>
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
            phaseActiveNode,
            afRelativePath,
            setAfRelativePath,
            afSelectedItemId,
            setAfSelectedItemId,
            bumpAfMirrorRefreshNonce,
            onPhaseSectionChange: setPhaseActiveSection,
            onPhaseItemChange: (sectionId, itemId, meta) => {
              setPhaseActiveSection(sectionId);
              setPhaseActiveItem(itemId);

              if (meta && Object.prototype.hasOwnProperty.call(meta, 'activeNode')) {
                setPhaseActiveNode(meta.activeNode || null);
              } else if (!itemId) {
                setPhaseActiveNode(null);
              }
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
          authClaims={authClaims}
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
          onProjectSelect={(project) => {
            openProject(project, { selectedAction: null });
          }}
          onDraftSelect={(project, draft) => {
            openProject(project, {
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
            openProject(project, {
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
            openProject(project, {
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
            openProject(project, { selectedAction: null });
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
    </View>
  );
}
