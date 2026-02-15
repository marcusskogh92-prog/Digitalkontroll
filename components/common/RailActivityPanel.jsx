/**
 * RailActivityPanel – Aktivitetsflik i vänsterpanelen.
 * Visar notiser (kommentarsnämnanden) + aktivitet (AI-analys klar, inloggningar, etc.)
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

function toTsMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
}

export default function RailActivityPanel({
  userNotifications = [],
  companyActivity = [],
  formatRelativeTime,
  findProjectById,
  requestProjectSwitch,
  setPhaseActiveSection,
  setPhaseActiveItem,
  setProjectModuleRoute,
  setSidePanelCollapsed,
  notificationsError = null,
  onMarkAllAsRead = null,
  markAllAsReadLoading = false,
}) {
  const mergedItems = useMemo(() => {
    const out = [];

    for (const n of userNotifications || []) {
      const ts = n?.createdAt && (typeof n.createdAt === 'number' || n.createdAt?.getTime)
        ? (typeof n.createdAt === 'number' ? n.createdAt : n.createdAt.getTime())
        : 0;
      out.push({
        _source: 'notification',
        _ts: ts,
        id: `notif-${n.id || Math.random()}`,
        type: 'notification',
        n,
      });
    }

    for (const a of companyActivity || []) {
      const ts = toTsMs(a?.ts || a?.createdAt);
      if (!ts) continue;
      out.push({
        _source: 'activity',
        _ts: ts,
        id: `act-${a.id || Math.random()}`,
        type: a?.type || 'activity',
        raw: a,
        kind: a?.kind,
        projectId: a?.projectId,
        projectName: a?.projectName,
        desc: a?.desc,
        status: a?.status,
        aiSection: a?.aiSection,
        aiItem: a?.aiItem,
      });
    }

    out.sort((x, y) => (y._ts || 0) - (x._ts || 0));
    return out.slice(0, 50);
  }, [userNotifications, companyActivity]);

  const handleNotificationPress = (n) => {
    const projectId = n?.projectId || n?.raw?.projectId;
    if (!projectId || !requestProjectSwitch) return;
    const p = findProjectById ? findProjectById(projectId) : null;
    if (!p) return;

    const isCommentMention = String(n?.type || '').toLowerCase() === 'comment_mention';
    const isAiAnalysisComplete = String(n?.type || '').toLowerCase() === 'ai_analysis_complete';

    const doNavigate = () => {
      setSidePanelCollapsed?.(true);
      let selectedAction = null;
      let phaseTarget = null;
      if (isCommentMention && (n?.fileId || n?.commentId)) {
        selectedAction = {
          kind: 'openFileComment',
          fileId: n.fileId,
          fileName: n.fileName,
          commentId: n.commentId,
          pageNumber: n.pageNumber,
        };
      }
      if (isAiAnalysisComplete && (n?.kind === 'ffu' || n?.kind === 'kalkyl')) {
        phaseTarget = { kind: n.kind };
      }
      requestProjectSwitch(p, { selectedAction, clearActionAfter: true, phaseTarget });
    };

    if (isAiAnalysisComplete) {
      doNavigate();
      return;
    }
    const confirmTitle = isCommentMention ? 'Gå till taggningen' : 'Öppna projekt';
    const confirmMessage = isCommentMention
      ? 'Vill du gå till taggningen i dokumentet?'
      : 'Vill du öppna projektet?';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${confirmMessage}`)) {
        doNavigate();
      }
    } else {
      Alert.alert(confirmTitle, confirmMessage, [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Gå till', onPress: doNavigate },
      ]);
    }
  };

  const handleActivityPress = (item) => {
    if (item.type === 'AI-analys' && item.projectId) {
      const p = findProjectById ? findProjectById(item.projectId) : null;
      if (!p || !requestProjectSwitch) return;
      setSidePanelCollapsed?.(true);
      const phaseTarget = (item.kind === 'ffu' || item.kind === 'kalkyl')
        ? { kind: item.kind }
        : (item.aiSection || item.aiItem)
          ? { aiSection: item.aiSection, aiItem: item.aiItem }
          : undefined;
      requestProjectSwitch(p, { selectedAction: null, phaseTarget });
    } else if (item.projectId) {
      const p = findProjectById ? findProjectById(item.projectId) : null;
      if (!p || !requestProjectSwitch) return;
      setSidePanelCollapsed?.(true);
      const phaseTarget = (item.aiSection || item.aiItem)
        ? { aiSection: item.aiSection, aiItem: item.aiItem }
        : undefined;
      requestProjectSwitch(p, { selectedAction: null, phaseTarget });
    }
  };

  const unreadCount = (userNotifications || []).filter((n) => !n?.read).length;
  const hasUnread = unreadCount > 0;

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {hasUnread && typeof onMarkAllAsRead === 'function' ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          <TouchableOpacity
            onPress={onMarkAllAsRead}
            disabled={markAllAsReadLoading}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 6,
              paddingHorizontal: 10,
              backgroundColor: '#f1f5f9',
              borderRadius: 8,
            }}
          >
            {markAllAsReadLoading ? (
              <ActivityIndicator size="small" color="#64748b" style={{ marginRight: 6 }} />
            ) : (
              <Ionicons name="checkmark-done-outline" size={16} color="#64748b" style={{ marginRight: 6 }} />
            )}
            <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500' }}>
              Markera alla som lästa
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator
      >
        {notificationsError ? (
          <Text style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{notificationsError}</Text>
        ) : null}

        {mergedItems.length === 0 && !notificationsError ? (
          <Text style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
            Inga notiser eller aktiviteter. När någon nämner dig eller en AI-analys blir klar visas det här.
          </Text>
        ) : (
          mergedItems.map((item) => {
            if (item._source === 'notification') {
              const n = item.n;
              const isAiAnalysisComplete = String(n?.type || '').toLowerCase() === 'ai_analysis_complete';
              const authorName = (n?.authorName && String(n.authorName).trim()) || 'Någon';
              const textPreview = (n?.textPreview && String(n.textPreview).trim()) ? String(n.textPreview).trim().slice(0, 100) : '';
              const timeText = (typeof formatRelativeTime === 'function' && (n?.createdAt || n?.ts) ? formatRelativeTime(n.createdAt || n.ts) : null) || '';
              const title = isAiAnalysisComplete ? (textPreview || `AI-analys (${n?.kind === 'kalkyl' ? 'Kalkyl' : 'Förfrågningsunderlag'}) klar`) : `${authorName} nämnde dig`;
              const iconName = isAiAnalysisComplete ? 'sparkles' : 'at-outline';
              const iconColor = isAiAnalysisComplete ? (n?.status === 'error' ? '#D32F2F' : '#43A047') : '#1976D2';

              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.8}
                  onPress={() => handleNotificationPress(n)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: '#E2E8F0',
                  }}
                >
                  <Ionicons name={iconName} size={18} color={iconColor} style={{ marginRight: 10, marginTop: 2 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, color: '#0F172A', fontWeight: '500' }} numberOfLines={1}>
                      {title}
                    </Text>
                    {!isAiAnalysisComplete && textPreview ? (
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={2}>
                        "{textPreview}{textPreview.length >= 100 ? '…' : ''}"
                      </Text>
                    ) : null}
                    {(n?.projectName || n?.projectId) && isAiAnalysisComplete ? (
                      <Text style={{ fontSize: 12, color: '#1976D2', marginTop: 2 }} numberOfLines={1}>
                        {n.projectName || n.projectId}
                      </Text>
                    ) : null}
                    {timeText ? <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{timeText}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            }

            const a = item.raw;
            const isAiAnalys = String(item.type || '').toLowerCase() === 'ai-analys';
            const isLogin = String(item.type || '').toLowerCase() === 'login';

            const iconName = isAiAnalys
              ? 'sparkles'
              : isLogin
                ? 'log-in-outline'
                : 'checkmark-circle-outline';
            const iconColor = isAiAnalys
              ? (item.status === 'error' ? '#D32F2F' : '#43A047')
              : isLogin
                ? '#1976D2'
                : '#43A047';

            const title = isAiAnalys
              ? (item.status === 'error' ? `AI-analys (${item.kind === 'kalkyl' ? 'Kalkyl' : 'FFU'}) misslyckades` : `AI-analys (${item.kind === 'kalkyl' ? 'Kalkyl' : 'Förfrågningsunderlag'}) klar`)
              : isLogin
                ? 'Loggade in'
                : (item.desc || item.type || 'Aktivitet');

            const timeText = (typeof formatRelativeTime === 'function' && a?.ts ? formatRelativeTime(a.ts) : null) || '';

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.8}
                onPress={() => handleActivityPress(item)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: '#E2E8F0',
                }}
              >
                <Ionicons name={iconName} size={18} color={iconColor} style={{ marginRight: 10, marginTop: 2 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, color: '#0F172A', fontWeight: '500' }} numberOfLines={1}>
                    {title}
                  </Text>
                  {(item.projectId || item.projectName) ? (
                    <Text style={{ fontSize: 12, color: '#1976D2', marginTop: 2 }} numberOfLines={1}>
                      {item.projectName || item.projectId}
                    </Text>
                  ) : null}
                  {timeText ? <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{timeText}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
