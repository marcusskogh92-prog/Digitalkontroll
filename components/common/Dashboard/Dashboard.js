/**
 * Dashboard - Main dashboard component
 * Extracted from HomeScreen.js to improve code organization
 */

import React from 'react';
import { Platform, View } from 'react-native';
import DashboardAllProjects from './DashboardAllProjects';

const Dashboard = ({
  // State
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
  
  // Callbacks
  onProjectSelect,
  onDraftSelect,
  onControlToSignSelect,
  onDeviationSelect,
  onSkyddsrondSelect,
  onToggleDashboardFocus,
  onDashboardHover,
  formatRelativeTime,
  findProjectById,
  hierarchy,
  _countProjectStatus,
  setDashboardBtn1Failed,
  setDashboardBtn2Failed,
  companyName,
  onCreateProject,
  companyId = null,
  currentUserId = null,
}) => {
  // Dashboard styles (moved from HomeScreen)
  const dashboardContainerStyle = React.useMemo(() => ({ width: '100%', maxWidth: 1180, alignSelf: 'center' }), []);
  const dashboardColumnsStyle = React.useMemo(() => ({
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: Platform.OS === 'web' ? 16 : 0,
    alignItems: Platform.OS === 'web' ? 'flex-start' : 'stretch',
  }), []);

  return (
    <View style={dashboardContainerStyle}>
      {/* All Projects Table - Full width on web */}
      {Platform.OS === 'web' && (
        <View style={{ marginBottom: 24 }}>
          <DashboardAllProjects
            hierarchy={hierarchy}
            onProjectSelect={onProjectSelect}
            formatRelativeTime={formatRelativeTime}
            companyName={companyName}
            onCreateProject={onCreateProject}
            dashboardLoading={dashboardLoading}
            companyId={companyId}
            currentUserId={currentUserId}
          />
        </View>
      )}
    </View>
  );
};

export default Dashboard;
