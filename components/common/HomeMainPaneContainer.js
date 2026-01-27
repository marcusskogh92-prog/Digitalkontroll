import { Platform, View } from 'react-native';

import NativeMainPane from './NativeMainPane';
import WebMainPane from './WebMainPane';

/**
 * HomeMainPaneContainer
 *
 * Tunnt skal runt WebMainPane / NativeMainPane som kapslar in
 * all wiring för dashboard + projektvy, men exponerar samma
 * props-signatur som tidigare HomeScreen-användning.
 */
export function HomeMainPaneContainer(props) {
  const {
    webPaneHeight,
    rightPaneScrollRef,
    activityScrollRef,
    inlineControlEditor,
    closeInlineControlEditor,
    handleInlineControlFinished,
    creatingProjectInline,
    selectedProjectSafe,
    auth,
    creatingProject,
    newProjectNumber,
    setNewProjectNumber,
    newProjectName,
    setNewProjectName,
    hierarchySafe,
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
    setNewProjectModal,
    scrollToEndSafe,
    rightWidth,
    panResponderRight,
    projectPhaseKeySafe,
    onOpenCreateProjectModal,
    // Native-specifika props
    phaseActiveSection,
    phaseActiveItem,
    setPhaseActiveSection,
    setPhaseActiveItem,
  } = props;

  const isWeb = Platform.OS === 'web';

  return (
    <View style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
      {isWeb ? (
        <WebMainPane
          webPaneHeight={webPaneHeight}
          rightPaneScrollRef={rightPaneScrollRef}
          activityScrollRef={activityScrollRef}
          inlineControlEditor={inlineControlEditor}
          closeInlineControlEditor={closeInlineControlEditor}
          handleInlineControlFinished={handleInlineControlFinished}
          creatingProjectInline={creatingProjectInline}
          selectedProject={selectedProjectSafe}
          auth={auth}
          creatingProject={creatingProject}
          newProjectNumber={newProjectNumber}
          setNewProjectNumber={setNewProjectNumber}
          newProjectName={newProjectName}
          setNewProjectName={setNewProjectName}
          hierarchy={hierarchySafe}
          setHierarchy={setHierarchy}
          resetProjectFields={resetProjectFields}
          requestProjectSwitch={requestProjectSwitch}
          selectedProjectPath={selectedProjectPath}
          setCreatingProject={setCreatingProject}
          setCreatingProjectInline={setCreatingProjectInline}
          setSelectedProject={setSelectedProject}
          setSelectedProjectPath={setSelectedProjectPath}
          isProjectNumberUnique={isProjectNumberUnique}
          projectSelectedAction={projectSelectedAction}
          handleInlineLockChange={handleInlineLockChange}
          handleInlineViewChange={handleInlineViewChange}
          projectControlsRefreshNonce={projectControlsRefreshNonce}
          navigation={navigation}
          toggleDashboardFocus={toggleDashboardFocus}
          closeSelectedProject={closeSelectedProject}
          dashboardFocus={dashboardFocus}
          setDashboardFocus={setDashboardFocus}
          dashboardDropdownTop={dashboardDropdownTop}
          setDashboardDropdownTop={setDashboardDropdownTop}
          dashboardHoveredStatKey={dashboardHoveredStatKey}
          setDashboardHoveredStatKey={setDashboardHoveredStatKey}
          dashboardDropdownAnchor={dashboardDropdownAnchor}
          dashboardDropdownRowKey={dashboardDropdownRowKey}
          setDashboardDropdownRowKey={setDashboardDropdownRowKey}
          dashboardLoading={dashboardLoading}
          dashboardOverview={dashboardOverview}
          dashboardRecentProjects={dashboardRecentProjects}
          companyActivity={companyActivity}
          dashboardActiveProjectsList={dashboardActiveProjectsList}
          dashboardDraftItems={dashboardDraftItems}
          dashboardControlsToSignItems={dashboardControlsToSignItems}
          dashboardOpenDeviationItems={dashboardOpenDeviationItems}
          dashboardUpcomingSkyddsrondItems={dashboardUpcomingSkyddsrondItems}
          dashboardBtn1Url={dashboardBtn1Url}
          dashboardBtn2Url={dashboardBtn2Url}
          dashboardBtn1Failed={dashboardBtn1Failed}
          dashboardBtn2Failed={dashboardBtn2Failed}
          setDashboardBtn1Failed={setDashboardBtn1Failed}
          setDashboardBtn2Failed={setDashboardBtn2Failed}
          dashboardCardLayoutRef={dashboardCardLayoutRef}
          dashboardStatRowLayoutRef={dashboardStatRowLayoutRef}
          formatRelativeTime={formatRelativeTime}
          findProjectById={findProjectById}
          _countProjectStatus={_countProjectStatus}
          companyProfile={companyProfile}
          companyId={companyId}
          routeCompanyId={routeCompanyId}
          scrollToEndSafe={scrollToEndSafe}
          rightWidth={rightWidth}
          panResponderRight={panResponderRight}
          projectPhaseKey={projectPhaseKeySafe}
          phaseActiveSection={phaseActiveSection}
          phaseActiveItem={phaseActiveItem}
          setPhaseActiveSection={setPhaseActiveSection}
          setPhaseActiveItem={setPhaseActiveItem}
          onOpenCreateProjectModal={onOpenCreateProjectModal}
        />
      ) : (
        <NativeMainPane
          rightPaneScrollRef={rightPaneScrollRef}
          selectedProject={selectedProjectSafe}
          companyId={companyId}
          projectSelectedAction={projectSelectedAction}
          handleInlineLockChange={handleInlineLockChange}
          phaseActiveSection={phaseActiveSection}
          phaseActiveItem={phaseActiveItem}
          setPhaseActiveSection={setPhaseActiveSection}
          setPhaseActiveItem={setPhaseActiveItem}
          navigation={navigation}
          closeSelectedProject={closeSelectedProject}
          projectControlsRefreshNonce={projectControlsRefreshNonce}
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
          requestProjectSwitch={requestProjectSwitch}
          toggleDashboardFocus={toggleDashboardFocus}
          setDashboardHoveredStatKey={setDashboardHoveredStatKey}
          formatRelativeTime={formatRelativeTime}
          findProjectById={findProjectById}
          hierarchy={hierarchySafe}
          _countProjectStatus={_countProjectStatus}
          setDashboardBtn1Failed={setDashboardBtn1Failed}
          setDashboardBtn2Failed={setDashboardBtn2Failed}
          setDashboardDropdownRowKey={setDashboardDropdownRowKey}
          companyProfile={companyProfile}
          routeCompanyId={routeCompanyId}
          auth={auth}
          setNewProjectModal={setNewProjectModal}
        />
      )}
    </View>
  );
}

export default HomeMainPaneContainer;
