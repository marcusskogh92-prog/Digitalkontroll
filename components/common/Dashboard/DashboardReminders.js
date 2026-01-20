/**
 * DashboardReminders - Reminders section
 * TODO: Extract full implementation from HomeScreen.js
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';

const DashboardReminders = ({
  dashboardLoading,
  dashboardOverview,
  dashboardFocus,
  dashboardHoveredStatKey,
  dashboardDropdownAnchor,
  dashboardDropdownTop,
  dashboardDropdownRowKey,
  dashboardUpcomingSkyddsrondItems,
  dashboardOpenDeviationItems,
  dashboardDraftItems,
  dashboardCardLayoutRef,
  dashboardStatRowLayoutRef,
  webPaneHeight,
  onSkyddsrondSelect,
  onDeviationSelect,
  onDraftSelect,
  onToggleDashboardFocus,
  onDashboardHover,
  formatRelativeTime,
  findProjectById,
}) => {
  const dashboardSectionTitleStyle = React.useMemo(() => ({ fontSize: 20, fontWeight: '700', color: '#222', marginTop: 12, marginBottom: 8, zIndex: 10, position: 'relative' }), []);
  const dashboardCardStyle = React.useMemo(() => ({ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 16, marginBottom: 16, position: 'relative', backgroundColor: '#fff' }), []);
  const dashboardStatRowStyle = React.useCallback((idx) => ({
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderTopWidth: idx === 0 ? 0 : 1,
    borderTopColor: '#eee',
  }), []);
  const dashboardStatDotStyle = React.useCallback((color) => ({ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 12 }), []);
  const dashboardStatLabelStyle = React.useMemo(() => ({ flex: 1, fontSize: 15, color: '#222' }), []);
  const dashboardStatValueStyle = React.useMemo(() => ({ fontSize: 16, fontWeight: '400', color: '#222' }), []);
  const dashboardEmptyTextStyle = React.useMemo(() => ({ color: '#777', padding: 12 }), []);

  // This is a simplified version - full implementation needs to be extracted from HomeScreen.js
  // For now, this provides the basic structure
  return (
    <>
      <Text style={dashboardSectionTitleStyle}>Påminnelser</Text>
      <View
        style={dashboardCardStyle}
        onLayout={Platform.OS === 'web' ? (e) => { dashboardCardLayoutRef.current.reminders = e?.nativeEvent?.layout || null; } : undefined}
      >
        {[
          {
            key: 'remindersSkyddsrondUpcoming',
            label: 'Kommande skyddsronder',
            color: '#FFD600',
            value: (dashboardOverview?.skyddsrondDueSoon ?? 0) + (dashboardOverview?.skyddsrondOverdue ?? 0),
            focus: 'upcomingSkyddsrond',
          },
          { 
            key: 'remindersOpenDeviations', 
            label: 'Öppna avvikelser', 
            color: '#FFD600', 
            value: dashboardOverview?.openDeviations || 0, 
            focus: 'openDeviations' 
          },
          { 
            key: 'remindersDrafts', 
            label: 'Sparade utkast', 
            color: '#888', 
            value: dashboardOverview?.drafts || 0, 
            focus: 'drafts' 
          },
        ].map((row, ridx) => {
          const isWeb = Platform.OS === 'web';
          const isHovered = isWeb && dashboardHoveredStatKey === row.key;
          const isOpen = isWeb && dashboardFocus === row.focus && dashboardDropdownAnchor === 'reminders';
          
          return (
            <TouchableOpacity
              key={row.key}
              style={{
                ...dashboardStatRowStyle(ridx),
                borderWidth: 1,
                borderColor: isHovered ? '#1976D2' : 'transparent',
                backgroundColor: isHovered ? '#eee' : 'transparent',
                cursor: isWeb ? 'pointer' : undefined,
                transition: isWeb ? 'background 0.15s, border 0.15s' : undefined,
              }}
              activeOpacity={0.75}
              onPress={() => {
                if (onToggleDashboardFocus) {
                  const cardLayout = dashboardCardLayoutRef.current.reminders;
                  const rowLayout = dashboardStatRowLayoutRef.current[`reminders:${row.key}`];
                  const top = (cardLayout && rowLayout) ? (cardLayout.y + rowLayout.y + rowLayout.height) : undefined;
                  onToggleDashboardFocus(row.focus, 'reminders', top);
                }
              }}
              onMouseEnter={isWeb && onDashboardHover ? () => onDashboardHover(row.key) : undefined}
              onMouseLeave={isWeb && onDashboardHover ? () => onDashboardHover(null) : undefined}
              onLayout={isWeb ? (e) => {
                const l = e?.nativeEvent?.layout;
                if (l) dashboardStatRowLayoutRef.current[`reminders:${row.key}`] = l;
              } : undefined}
            >
              <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color="#222" style={{ marginRight: 6 }} />
              <View style={dashboardStatDotStyle(row.color)} />
              <Text style={dashboardStatLabelStyle}>{row.label}</Text>
              <Text style={dashboardStatValueStyle}>{String(row.value ?? 0)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      
      {/* TODO: Add dropdown overlay implementation from HomeScreen.js */}
    </>
  );
};

export default DashboardReminders;
