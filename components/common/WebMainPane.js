import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { subscribeUserNotifications } from '../firebase';
import ProjectDetails from '../../Screens/ProjectDetails';
import TemplateControlScreen from '../../Screens/TemplateControlScreen';
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
    projectPhaseKey,
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
  } = props;

  const isWeb = Platform.OS === 'web';
  const PANE_PADDING = 18;

  const [userNotifications, setUserNotifications] = useState([]);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const [notificationsError, setNotificationsError] = useState(null);
  const effectiveCompanyId = (companyId != null && String(companyId).trim()) ? String(companyId).trim() : (routeCompanyId != null && String(routeCompanyId).trim()) ? String(routeCompanyId).trim() : (authClaims?.companyId != null && String(authClaims.companyId).trim()) ? String(authClaims.companyId).trim() : '';
  const currentUserId = auth?.currentUser?.uid ?? null;
  useEffect(() => {
    if (!effectiveCompanyId || !currentUserId) {
      setUserNotifications([]);
      setNotificationsError(null);
      return () => {};
    }
    setNotificationsError(null);
    const unsub = subscribeUserNotifications(effectiveCompanyId, currentUserId, {
      onData: (list) => {
        setUserNotifications(Array.isArray(list) ? list : []);
        setNotificationsError(null);
      },
      onError: (err) => {
        setUserNotifications([]);
        const msg = err?.message || '';
        const isPermission = msg.toLowerCase().includes('permission') || err?.code === 'permission-denied';
        setNotificationsError(
          isPermission
            ? 'Behörighet saknas. Deploya regler: firebase deploy --only firestore:rules. Logga sedan ut och in igen.'
            : (msg || 'Kunde inte ladda notiser')
        );
      },
      limitCount: 30,
    });
    return () => { try { unsub?.(); } catch (_e) {} };
  }, [effectiveCompanyId, currentUserId]);
  const unreadCount = userNotifications.filter((n) => !n?.read).length;

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

      {isWeb ? (
        notificationsPanelOpen ? (
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
              style={{
                position: 'absolute',
                left: -8,
                top: 0,
                bottom: 0,
                width: 16,
                cursor: 'col-resize',
                zIndex: 9,
                pointerEvents: 'auto',
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600' }}>
                Notiser och händelser
              </Text>
              <Pressable
                onPress={() => setNotificationsPanelOpen(false)}
                style={{ padding: 8 }}
                hitSlop={8}
              >
                <Ionicons name="chevron-forward" size={24} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView
              ref={activityScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingTop: 0, paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER }}
              scrollEnabled
              nestedScrollEnabled
            >
              {notificationsError ? (
                <Text style={{ fontSize: 13, color: '#b91c1c', marginBottom: 8 }}>
                  {notificationsError}
                </Text>
              ) : null}
              {userNotifications.length === 0 && !notificationsError ? (
                <Text style={{ fontSize: 13, color: '#777' }}>
                  Inga notiser än. När någon nämner dig i en kommentar (t.ex. @ditt namn) visas det här.
                </Text>
              ) : (
                <View style={{ marginTop: 4 }}>
                  {userNotifications.map((n, index) => {
                    const isCommentMention = n?.type === 'comment_mention';
                    const authorName = (n?.authorName && String(n.authorName).trim()) || 'Någon';
                    const textPreview = (n?.textPreview && String(n.textPreview).trim()) ? String(n.textPreview).trim().slice(0, 120) : '';
                    const timeText = (typeof formatRelativeTime === 'function' && n?.createdAt ? formatRelativeTime(n.createdAt) : null) || (n?.createdAt ? new Date(n.createdAt).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
                    return (
                      <View
                        key={n.id || index}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 0,
                          borderBottomWidth: index < userNotifications.length - 1 ? 1 : 0,
                          borderBottomColor: '#E2E8F0',
                        }}
                      >
                        {isCommentMention ? (
                          <>
                            <Text style={{ fontSize: 13, color: '#0F172A', fontWeight: '500' }}>
                              {authorName} nämnde dig i en kommentar
                            </Text>
                            {textPreview ? (
                              <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={2}>
                                "{textPreview}{textPreview.length >= 120 ? '…' : ''}"
                              </Text>
                            ) : null}
                          </>
                        ) : (
                          <Text style={{ fontSize: 13, color: '#0F172A' }}>
                            {n?.textPreview || 'Ny händelse'}
                          </Text>
                        )}
                        {timeText ? (
                          <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                            {timeText}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        ) : (
          <View
            style={{
              width: 52,
              minWidth: 52,
              borderLeftWidth: 1,
              borderLeftColor: '#e6e6e6',
              backgroundColor: '#F7FAFC',
              alignItems: 'center',
              paddingTop: 16,
            }}
          >
            <Pressable
              onPress={() => setNotificationsPanelOpen(true)}
              style={{ position: 'relative', padding: 8 }}
              hitSlop={8}
            >
              <Ionicons name="notifications-outline" size={26} color="#1976D2" />
              {unreadCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    backgroundColor: '#D32F2F',
                    borderRadius: 10,
                    minWidth: 18,
                    height: 18,
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingHorizontal: 5,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Text style={{ fontSize: 10, color: '#64748b', marginTop: 4, textAlign: 'center' }} numberOfLines={2}>
              Notiser
            </Text>
          </View>
        )
      ) : null}
    </View>
  );
}
