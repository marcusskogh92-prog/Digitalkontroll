/**
 * DashboardRecentProjects - Recent projects list with phase color coding
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { getPhaseConfig } from '../../../features/projects/constants';

const DashboardRecentProjects = ({
  dashboardLoading,
  dashboardRecentProjects,
  onProjectSelect,
  formatRelativeTime,
}) => {
  const dashboardSectionTitleStyle = React.useMemo(() => ({ fontSize: 20, fontWeight: '700', color: '#222', marginTop: 12, marginBottom: 10 }), []);
  const dashboardCardStyle = React.useMemo(() => ({ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' }), []);
  const dashboardEmptyTextStyle = React.useMemo(() => ({ color: '#777', padding: 12 }), []);
  const dashboardMetaTextStyle = React.useMemo(() => ({ fontSize: 12, color: '#888', marginTop: 2 }), []);
  const dashboardLinkTitleStyle = React.useMemo(() => ({ fontSize: 13, color: '#1976D2', fontWeight: '400' }), []);
  const dashboardListItemStyle = React.useCallback((idx) => ({
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderTopWidth: idx === 0 ? 0 : 1,
    borderTopColor: '#eee',
  }), []);

  return (
    <>
      <Text style={dashboardSectionTitleStyle}>Senaste projekten</Text>
      <View style={dashboardCardStyle}>
        {dashboardLoading ? (
          <Text style={dashboardEmptyTextStyle}>Laddar…</Text>
        ) : (dashboardRecentProjects || []).length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Ionicons name="folder-outline" size={48} color="#ccc" style={{ marginBottom: 12 }} />
            <Text style={[dashboardEmptyTextStyle, { fontSize: 15, textAlign: 'center', marginBottom: 8 }]}>Inga senaste projekt ännu</Text>
            <Text style={[dashboardMetaTextStyle, { textAlign: 'center', marginBottom: 16 }]}>Skapa ditt första projekt genom att välja en mapp i sidopanelen till vänster</Text>
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === 'web') {
                  try { document.querySelector('[data-sidebar="new-project"]')?.click(); } catch (_e) {}
                }
              }}
              style={{
                backgroundColor: '#1976D2',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Skapa nytt projekt</Text>
            </TouchableOpacity>
          </View>
        ) : (
          (dashboardRecentProjects || []).map((entry, idx) => {
            const project = entry?.project || {};
            const projectPhase = project?.phase || 'kalkylskede';
            const phaseConfig = getPhaseConfig(projectPhase);
            
            return (
              <TouchableOpacity
                key={`${entry.projectId}-${idx}`}
                activeOpacity={0.85}
                onPress={() => {
                  if (entry?.project && onProjectSelect) {
                    onProjectSelect(entry.project);
                  }
                }}
                style={[
                  dashboardListItemStyle(idx),
                  {
                    borderLeftWidth: 4,
                    borderLeftColor: phaseConfig.color,
                    paddingLeft: 12,
                  }
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: phaseConfig.color,
                      marginRight: 8,
                    }}
                  />
                  <Text 
                    style={[
                      dashboardLinkTitleStyle,
                      { flex: 1, fontWeight: '500' }
                    ]} 
                    numberOfLines={1}
                  >
                    {entry.project.id} — {entry.project.name}
                  </Text>
                  <View
                    style={{
                      backgroundColor: `${phaseConfig.color}20`,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 12,
                      marginLeft: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color: phaseConfig.color,
                        fontWeight: '600',
                      }}
                    >
                      {phaseConfig.name}
                    </Text>
                  </View>
                </View>
                {formatRelativeTime && entry.ts && (
                  <Text style={dashboardMetaTextStyle}>
                    Senast aktivitet: {formatRelativeTime(entry.ts)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </>
  );
};

export default DashboardRecentProjects;
