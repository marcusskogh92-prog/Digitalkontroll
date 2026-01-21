import { Platform, ScrollView, View } from 'react-native';
import ProjectDetails from '../../Screens/ProjectDetails';
import { Dashboard } from './Dashboard';

export default function NativeMainPane({
  rightPaneScrollRef,
  selectedProject,
  companyId,
  projectSelectedAction,
  handleInlineLockChange,
  phaseActiveSection,
  phaseActiveItem,
  setPhaseActiveSection,
  setPhaseActiveItem,
  navigation,
  closeSelectedProject,
  projectControlsRefreshNonce,
  dashboardLoading,
  dashboardOverview,
  dashboardRecentProjects,
  companyActivity,
  dashboardFocus,
  dashboardHoveredStatKey,
  dashboardDropdownAnchor,
  dashboardDropdownTop,
  dashboardDropdownRowKey,
  dashboardActiveProjectsList,
  dashboardDraftItems,
  dashboardControlsToSignItems,
  dashboardOpenDeviationItems,
  dashboardUpcomingSkyddsrondItems,
  dashboardBtn1Url,
  dashboardBtn2Url,
  dashboardBtn1Failed,
  dashboardBtn2Failed,
  dashboardCardLayoutRef,
  dashboardStatRowLayoutRef,
  webPaneHeight,
  requestProjectSwitch,
  toggleDashboardFocus,
  setDashboardHoveredStatKey,
  formatRelativeTime,
  findProjectById,
  hierarchy,
  _countProjectStatus,
  setDashboardBtn1Failed,
  setDashboardBtn2Failed,
  setDashboardDropdownRowKey,
  selectedPhase,
  companyProfile,
  routeCompanyId,
  auth,
  setNewProjectModal,
}) {
  return (
    <ScrollView
      ref={rightPaneScrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
    >
      {selectedProject ? (
        <View style={{ flex: 1 }}>
          <ProjectDetails
            route={{
              params: {
                project: selectedProject,
                companyId,
                selectedAction: projectSelectedAction,
                onInlineLockChange: handleInlineLockChange,
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
        <View style={{ flex: 1, padding: 18 }}>
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
            onProjectSelect={(project) =>
              requestProjectSwitch(project, { selectedAction: null })
            }
            onDraftSelect={(project, draft) => {
              requestProjectSwitch(project, {
                selectedAction: {
                  id: `openDraft-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 7)}`,
                  kind: 'openDraft',
                  type: draft?.type || 'Utkast',
                  initialValues: draft,
                },
                clearActionAfter: true,
              });
              toggleDashboardFocus(null);
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
              toggleDashboardFocus(null);
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
              toggleDashboardFocus(null);
              setDashboardHoveredStatKey(null);
            }}
            onSkyddsrondSelect={(project) => {
              requestProjectSwitch(project, { selectedAction: null });
              toggleDashboardFocus(null);
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
            selectedPhase={selectedPhase}
            companyName={
              companyProfile?.companyName ||
              companyProfile?.name ||
              companyId ||
              null
            }
            companyId={companyId || routeCompanyId}
            currentUserId={auth?.currentUser?.uid || null}
            onCreateProject={() => {
              const firstSubFolder = hierarchy.find(
                (main) => main.children && main.children.length > 0,
              )?.children?.[0];
              if (firstSubFolder) {
                setNewProjectModal({
                  visible: true,
                  parentSubId: firstSubFolder.id,
                });
              } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                // If no subfolder exists, show message
                // eslint-disable-next-line no-alert
                alert(
                  'Skapa först en undermapp i sidopanelen för att kunna skapa projekt.',
                );
              }
            }}
          />
        </View>
      )}
    </ScrollView>
  );
}
