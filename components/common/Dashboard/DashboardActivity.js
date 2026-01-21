/**
 * DashboardActivity - "Senaste aktivitet"-panelen på dashboarden.
 * Fullständig implementation extraherad från HomeScreen.ActivityPanel.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { formatPersonName } from '../../formatPersonName';

const DashboardActivity = ({
  dashboardRecent,
  dashboardLoading,
  formatRelativeTime,
  findProjectById,
  requestProjectSwitch,
}) => {
  const dashboardSectionTitleStyle = React.useMemo(
    () => ({ fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 10 }),
    [],
  );
  const dashboardCardDenseStyle = React.useMemo(
    () => ({ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 10, backgroundColor: '#fff' }),
    [],
  );
  const dashboardEmptyTextStyle = React.useMemo(
    () => ({ color: '#777', padding: 12 }),
    [],
  );
  const dashboardActivityListItemStyle = React.useCallback(
    (idx) => ({
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderTopWidth: idx === 0 ? 0 : 1,
      borderTopColor: '#eee',
    }),
    [],
  );
  const dashboardActivityTitleCompactStyle = React.useMemo(
    () => ({ fontSize: 14, color: '#222', fontWeight: '600' }),
    [],
  );
  const dashboardActivityMetaCompactStyle = React.useMemo(
    () => ({ fontSize: 12, color: '#777', marginTop: 0 }),
    [],
  );

  return (
    <View style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <Text style={dashboardSectionTitleStyle}>Senaste aktivitet</Text>
      <View style={dashboardCardDenseStyle}>
        {dashboardLoading ? (
          <Text style={dashboardEmptyTextStyle}>Laddar…</Text>
        ) : (dashboardRecent || []).length === 0 ? (
          <Text style={dashboardEmptyTextStyle}>Ingen aktivitet ännu.</Text>
        ) : (
          (dashboardRecent || []).map((a, idx) => {
            const isLogin = String(a.type || '').toLowerCase() === 'login';
            const hasOpenDeviations = !isLogin && a.kind !== 'draft' && a.type === 'Skyddsrond' && (a.openDeviationsCount || 0) > 0;
            const iconName = isLogin
              ? 'log-in-outline'
              : (a.kind === 'draft'
                ? 'document-text-outline'
                : (hasOpenDeviations ? 'alert-circle' : 'checkmark-circle'));
            const iconColor = isLogin
              ? '#1976D2'
              : (a.kind === 'draft'
                ? '#FFD600'
                : (hasOpenDeviations ? '#D32F2F' : '#43A047'));

            const who = formatPersonName(a.actorName || a.actorEmail || a.actor || a.email || a.uid || '');
            const title = isLogin
              ? (who ? `Loggade in: ${who}` : 'Loggade in')
              : (a.kind === 'draft'
                ? `Utkast sparat: ${a.type}${who ? ` — av ${who}` : ''}`
                : `Slutförd: ${a.type}${who ? ` — av ${who}` : ''}`);

            return (
              <TouchableOpacity
                key={`${a.kind}-${a.ts || 'no-ts'}-${idx}`}
                activeOpacity={0.85}
                onPress={() => {
                  if (isLogin) return;
                  if (!a.projectId) return;
                  const p = findProjectById ? findProjectById(a.projectId) : null;
                  if (!p || !requestProjectSwitch) return;

                  if (a.kind === 'draft') {
                    const raw = a.raw || null;
                    const stableId = raw?.id || raw?.draftId || raw?.controlId || raw?.localId || raw?.savedAt || a.ts || Date.now();
                    const selectedAction = {
                      id: `openDraft:${String(a.projectId)}:${String(stableId)}`,
                      kind: 'openDraft',
                      type: a.type,
                      initialValues: raw || undefined,
                    };
                    requestProjectSwitch(p, { selectedAction, clearActionAfter: true });
                  } else {
                    requestProjectSwitch(p, { selectedAction: null });
                  }
                }}
                style={[{ flexDirection: 'row', alignItems: 'flex-start' }, dashboardActivityListItemStyle(idx)]}
              >
                <Ionicons name={iconName} size={16} color={iconColor} style={{ marginTop: 2, marginRight: 8 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={dashboardActivityTitleCompactStyle} numberOfLines={1}>
                    {title}
                  </Text>
                  {(a.projectId || a.projectName) ? (
                    <Text style={{ fontSize: 13, color: '#1976D2', marginTop: 2 }} numberOfLines={1}>
                      {a.projectId ? String(a.projectId) : ''}
                      {(a.projectId && a.projectName) ? ' - ' : ''}
                      {a.projectName ? String(a.projectName) : ''}
                    </Text>
                  ) : null}
                  {a.desc && (!isLogin || a.desc !== title) ? (
                    <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }} numberOfLines={1}>
                      {a.desc}
                    </Text>
                  ) : null}
                  {(!isLogin && who) ? (
                    <Text style={dashboardActivityMetaCompactStyle} numberOfLines={1}>
                      {`Av: ${who} ${formatRelativeTime ? formatRelativeTime(a.ts) : ''}`}
                    </Text>
                  ) : (
                    <Text style={dashboardActivityMetaCompactStyle}>
                      {formatRelativeTime ? formatRelativeTime(a.ts) : ''}
                    </Text>
                  )}
                </View>

                {Platform.OS === 'web' && hasOpenDeviations && (
                  <TouchableOpacity
                    onPress={(e) => {
                      try { e && e.stopPropagation && e.stopPropagation(); } catch (_e) {}
                      if (!a.projectId) return;
                      const p = findProjectById ? findProjectById(a.projectId) : null;
                      if (!p || !requestProjectSwitch) return;
                      const raw = a.raw || null;
                      const stableId = raw?.id || raw?.controlId || raw?.localId || raw?.savedAt || a.ts || Date.now();
                      const selectedAction = {
                        id: `openControlDetails:${String(a.projectId)}:${String(stableId)}`,
                        kind: 'openControlDetails',
                        control: raw || undefined,
                      };
                      requestProjectSwitch(p, { selectedAction, clearActionAfter: true });
                    }}
                    style={{
                      marginLeft: 12,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: '#FFD600',
                      alignSelf: 'center',
                    }}
                    activeOpacity={0.85}
                    accessibilityLabel="Åtgärda avvikelse"
                  >
                    <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>Åtgärda</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
};

export default DashboardActivity;
