import { ScrollView, View } from 'react-native';
import ProjectDetails from '../../Screens/ProjectDetails';
import { Dashboard } from './Dashboard';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from './layoutConstants';

export default function NativeMainPane({
  rightPaneScrollRef,
  selectedProject,
  companyId,
  projectSelectedAction,
  handleInlineLockChange,
  phaseActiveSection,
  phaseActiveItem,
  phaseActiveNode,
  setPhaseActiveSection,
  setPhaseActiveItem,
  setPhaseActiveNode,
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
  openProject,
  toggleDashboardFocus,
  setDashboardHoveredStatKey,
  formatRelativeTime,
  findProjectById,
  hierarchy,
  _countProjectStatus,
  setDashboardBtn1Failed,
  setDashboardBtn2Failed,
  setDashboardDropdownRowKey,
  companyProfile,
  routeCompanyId,
  auth,
  setNewProjectModal,
  onOpenCreateProjectModal,

  // AF-only explorer state (shared with left panel mirror)
  afRelativePath,
  setAfRelativePath,
  afSelectedItemId,
  setAfSelectedItemId,
  bumpAfMirrorRefreshNonce,
}) {
  return (
    <ScrollView
      ref={rightPaneScrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER }}
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
            onProjectSelect={(project) => {
              openProject(project, { selectedAction: null });
            }}
            onDraftSelect={(project, draft) => {
              openProject(project, {
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
              openProject(project, {
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
              openProject(project, {
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
              openProject(project, { selectedAction: null });
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
            companyName={
              companyProfile?.companyName ||
              companyProfile?.name ||
              companyId ||
              null
            }
            companyId={companyId || routeCompanyId}
            currentUserId={auth?.currentUser?.uid || null}
            onCreateProject={() => {
              // Preferred flow: SharePoint-based CreateProjectModal.
              if (typeof onOpenCreateProjectModal === 'function') {
                onOpenCreateProjectModal();
                return;
              }

              // Legacy fallback (kept for safety if modal isn't wired in some screen).
              const firstSubFolder = hierarchy.find(
                (main) => main.children && main.children.length > 0,
              )?.children?.[0];
              if (firstSubFolder && typeof setNewProjectModal === 'function') {
                setNewProjectModal({
                  visible: true,
                  parentSubId: firstSubFolder.id,
                });
                return;
              }
              // No manual-prep requirement anymore; if we can't open the new modal,
              // we intentionally do nothing instead of blocking with an instruction.
            }}
          />
        </View>
      )}
    </ScrollView>
  );
}
