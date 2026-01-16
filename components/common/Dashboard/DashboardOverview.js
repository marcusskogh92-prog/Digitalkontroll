/**
 * DashboardOverview - Overview section (Översikt)
 * TODO: Extract full implementation from HomeScreen.js
 */

import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DashboardOverview = ({
  dashboardOverview,
  hierarchy,
  _countProjectStatus,
  dashboardFocus,
  dashboardHoveredStatKey,
  dashboardDropdownAnchor,
  dashboardCardLayoutRef,
  dashboardStatRowLayoutRef,
  onToggleDashboardFocus,
  onDashboardHover,
  onProjectSelect,
  onDraftSelect,
  onControlToSignSelect,
}) => {
  const dashboardSectionTitleStyle = React.useMemo(() => ({ fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 10 }), []);
  const dashboardCardStyle = React.useMemo(() => ({ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, marginBottom: 20, backgroundColor: '#fff' }), []);
  const dashboardStatRowStyle = React.useCallback((idx) => ({
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: idx === 0 ? 0 : 1,
    borderTopColor: '#eee',
  }), []);
  const dashboardStatDotStyle = React.useCallback((color) => ({ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 12 }), []);
  const dashboardStatLabelStyle = React.useMemo(() => ({ flex: 1, fontSize: 15, color: '#222' }), []);
  const dashboardStatValueStyle = React.useMemo(() => ({ fontSize: 16, fontWeight: '400', color: '#222' }), []);

  return (
    <>
      <Text style={dashboardSectionTitleStyle}>Översikt</Text>
      <View
        style={dashboardCardStyle}
        onLayout={Platform.OS === 'web' ? (e) => { dashboardCardLayoutRef.current.overview = e?.nativeEvent?.layout || null; } : undefined}
      >
        {[
          { key: 'activeProjects', label: 'Pågående projekt', color: '#43A047', value: dashboardOverview?.activeProjects || 0, focus: 'activeProjects' },
          { key: 'completedProjects', label: 'Avslutade projekt', color: '#222', value: (_countProjectStatus ? _countProjectStatus(hierarchy).completed : 0), focus: 'completedProjects' },
          { key: 'controlsToSign', label: 'Kontroller att signera', color: '#D32F2F', value: dashboardOverview?.controlsToSign || 0, focus: 'controlsToSign' },
          { key: 'drafts', label: 'Sparade utkast', color: '#888', value: dashboardOverview?.drafts || 0, focus: 'drafts' },
        ].map((row, ridx) => {
          const isWeb = Platform.OS === 'web';
          const isHovered = isWeb && dashboardHoveredStatKey === row.key;
          const isOpen = isWeb && dashboardFocus === row.focus && dashboardDropdownAnchor === 'overview';
          
          return (
            <TouchableOpacity
              key={row.key}
              style={{
                ...dashboardStatRowStyle(ridx),
                paddingHorizontal: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isHovered ? '#1976D2' : 'transparent',
                backgroundColor: isHovered ? '#eee' : 'transparent',
                cursor: isWeb ? 'pointer' : undefined,
                transition: isWeb ? 'background 0.15s, border 0.15s' : undefined,
              }}
              activeOpacity={0.75}
              onPress={() => {
                if (onToggleDashboardFocus) {
                  const cardLayout = dashboardCardLayoutRef.current.overview;
                  const rowLayout = dashboardStatRowLayoutRef.current[`overview:${row.key}`];
                  const cardPadding = 12;
                  const top = (cardLayout && rowLayout) ? (cardLayout.y + cardPadding + rowLayout.y + rowLayout.height) : undefined;
                  onToggleDashboardFocus(row.focus, 'overview', top);
                }
              }}
              onMouseEnter={isWeb && onDashboardHover ? () => onDashboardHover(row.key) : undefined}
              onMouseLeave={isWeb && onDashboardHover ? () => onDashboardHover(null) : undefined}
              onLayout={isWeb ? (e) => {
                const l = e?.nativeEvent?.layout;
                if (l) dashboardStatRowLayoutRef.current[`overview:${row.key}`] = l;
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

export default DashboardOverview;
