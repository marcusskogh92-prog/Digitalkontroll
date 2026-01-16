/**
 * DashboardActivity - Recent activity section
 * TODO: Extract full implementation from HomeScreen.js
 */

import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DashboardActivity = ({
  companyActivity,
  formatRelativeTime,
}) => {
  const dashboardSectionTitleStyle = React.useMemo(() => ({ fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 10 }), []);
  const dashboardCardStyle = React.useMemo(() => ({ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' }), []);
  const dashboardActivityTitleStyle = React.useMemo(() => ({ fontSize: 15, color: '#222', fontWeight: '600' }), []);
  const dashboardActivityMetaCompactStyle = React.useMemo(() => ({ fontSize: 12, color: '#777', marginTop: 0 }), []);
  const dashboardActivityListItemStyle = React.useCallback((idx) => ({
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderTopWidth: idx === 0 ? 0 : 1,
    borderTopColor: '#eee',
  }), []);

  return (
    <>
      <Text style={dashboardSectionTitleStyle}>Senaste aktivitet</Text>
      <View style={dashboardCardStyle}>
        <ScrollView style={{ maxHeight: 300 }}>
          {(!companyActivity || companyActivity.length === 0) ? (
            <Text style={{ color: '#777', padding: 12, textAlign: 'center' }}>Ingen aktivitet ännu</Text>
          ) : (
            companyActivity.slice(0, 10).map((entry, idx) => (
              <View key={`activity-${idx}`} style={dashboardActivityListItemStyle(idx)}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Ionicons name="arrow-forward" size={14} color="#1976D2" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={dashboardActivityTitleStyle}>{entry.action || 'Aktivitet'}</Text>
                    {formatRelativeTime && entry.ts && (
                      <Text style={dashboardActivityMetaCompactStyle}>
                        {formatRelativeTime(entry.ts)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </>
  );
};

export default DashboardActivity;
