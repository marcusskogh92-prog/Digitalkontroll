/**
 * Dashboard - Main dashboard component
 * Extracted from HomeScreen.js to improve code organization
 */

import React from 'react';
import { Platform, View } from 'react-native';
import DashboardCards from './DashboardCards';
import DashboardRecentProjects from './DashboardRecentProjects';
import DashboardReminders from './DashboardReminders';

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
      {/* Dashboard Action Cards (Ny kontroll, Dagens uppgifter) - Web only */}
      {Platform.OS === 'web' && (
        <DashboardCards
          dashboardBtn1Url={dashboardBtn1Url}
          dashboardBtn2Url={dashboardBtn2Url}
          dashboardBtn1Failed={dashboardBtn1Failed}
          dashboardBtn2Failed={dashboardBtn2Failed}
          onButton1Error={setDashboardBtn1Failed}
          onButton2Error={setDashboardBtn2Failed}
        />
      )}

      <View style={dashboardColumnsStyle}>
        {/* Column 1: Recent Projects */}
        <View style={{ flex: 1, minWidth: 360, marginRight: 16 }}>
          <DashboardRecentProjects
            dashboardLoading={dashboardLoading}
            dashboardRecentProjects={dashboardRecentProjects}
            onProjectSelect={onProjectSelect}
            formatRelativeTime={formatRelativeTime}
          />
        </View>

        {/* Column 2: Reminders */}
        <View style={{ width: 320, minWidth: 280, position: 'relative' }}>
          <DashboardReminders
            dashboardLoading={dashboardLoading}
            dashboardOverview={dashboardOverview}
            dashboardFocus={dashboardFocus}
            dashboardHoveredStatKey={dashboardHoveredStatKey}
            dashboardDropdownAnchor={dashboardDropdownAnchor}
            dashboardDropdownTop={dashboardDropdownTop}
            dashboardDropdownRowKey={dashboardDropdownRowKey}
            dashboardUpcomingSkyddsrondItems={dashboardUpcomingSkyddsrondItems}
            dashboardOpenDeviationItems={dashboardOpenDeviationItems}
            dashboardDraftItems={dashboardDraftItems}
            dashboardCardLayoutRef={dashboardCardLayoutRef}
            dashboardStatRowLayoutRef={dashboardStatRowLayoutRef}
            webPaneHeight={webPaneHeight}
            onSkyddsrondSelect={onSkyddsrondSelect}
            onDeviationSelect={onDeviationSelect}
            onDraftSelect={onDraftSelect}
            onToggleDashboardFocus={onToggleDashboardFocus}
            onDashboardHover={onDashboardHover}
            formatRelativeTime={formatRelativeTime}
            findProjectById={findProjectById}
          />
        </View>

        {/* Column 3: Overview & Activity (moved to ActivityPanel on web) */}
        {/* This is handled by ActivityPanel in HomeScreen */}
      </View>
    </View>
  );
};

export default Dashboard;
