/**
 * DashboardAllProjects - Shows all projects in a table format on the dashboard
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { fetchUserProfile, subscribeCompanyActivity } from '../../../components/firebase';
import { getPhaseConfig } from '../../../features/projects/constants';

const DashboardAllProjects = ({
  hierarchy = [],
  onProjectSelect,
  formatRelativeTime,
  companyName,
  onCreateProject,
  dashboardLoading = false,
  companyId = null,
  currentUserId = null,
}) => {
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [nameMap, setNameMap] = useState({});
  const pendingRef = useRef({});
  
  // Subscribe to company activity for notifications
  useEffect(() => {
    if (!companyId) return;
    
    const unsub = subscribeCompanyActivity(companyId, {
      onData: (data) => {
        try {
          const arr = Array.isArray(data) ? data : [];
          // Filter for activities related to projects user is involved in
          // For now, show all company activities - can be filtered later by project participants
          setNotifications(arr.slice(0, 20)); // Show last 20 notifications
        } catch (_e) {}
      },
      onError: () => {},
      limitCount: 25,
    });
    
    return () => { try { unsub(); } catch(_e) {} };
  }, [companyId]);
  
  // Resolve display names for notification actors
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const uids = Array.from(new Set(
          notifications.map(it => it && (it.uid || it.userId)).filter(Boolean)
        ));
        const toFetch = uids.filter(u => !nameMap[u] && !pendingRef.current[u]);
        if (toFetch.length === 0) return;
        for (const uid of toFetch) pendingRef.current[uid] = true;
        await Promise.all(toFetch.map(async (uid) => {
          try {
            const profile = await fetchUserProfile(uid);
            if (!mounted) return;
            setNameMap(prev => ({ 
              ...prev, 
              [uid]: (profile && (profile.displayName || (profile.name || ''))) || null 
            }));
          } catch(_e) {
            // ignore
          } finally {
            try { delete pendingRef.current[uid]; } catch(_e) {}
          }
        }));
      } catch(_e) {}
    })();
    return () => { mounted = false; };
  }, [notifications, nameMap]);
  
  // Count unread notifications (for badge)
  const unreadCount = useMemo(() => {
    // For now, count all notifications as "unread"
    // Can be enhanced later with read/unread tracking
    return notifications.length;
  }, [notifications]);
  // Extract all projects from hierarchy (no phase filtering here anymore)
  const allProjects = useMemo(() => {
    const projects = [];
    
    if (!Array.isArray(hierarchy)) return projects;
    
    hierarchy.forEach(main => {
      if (!main.children || !Array.isArray(main.children)) return;
      
      main.children.forEach(sub => {
        if (!sub.children || !Array.isArray(sub.children)) return;
        
        sub.children.forEach(child => {
          if (child.type === 'project') {
            projects.push({
              ...child,
              mainFolder: main.name,
              subFolder: sub.name,
            });
          }
        });
      });
    });
    
    // Sort by project number/name
    return projects.sort((a, b) => {
      const aId = String(a.id || '').toLowerCase();
      const bId = String(b.id || '').toLowerCase();
      return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [hierarchy]);

  const tableHeaderStyle = useMemo(() => ({
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 2,
    borderBottomColor: '#e0e0e0',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  }), []);

  const tableHeaderTextStyle = useMemo(() => ({
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  }), []);

  const tableRowStyle = useMemo(() => ({
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
    alignItems: 'center',
  }), []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#222';
      case 'ongoing':
        return '#43A047';
      case 'onhold':
        return '#F57C00';
      default:
        return '#43A047';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed':
        return 'Avslutat';
      case 'ongoing':
        return 'Pågående';
      case 'onhold':
        return 'Pausad';
      default:
        return 'Pågående';
    }
  };

  // Calculate summary info for single project
  const projectSummary = useMemo(() => {
    if (allProjects.length !== 1) return null;
    const project = allProjects[0];
    const lastUpdated = project.updatedAt || project.createdAt || null;
    return {
      project,
      lastUpdated,
      lastUpdatedText: lastUpdated && formatRelativeTime 
        ? formatRelativeTime(lastUpdated) 
        : lastUpdated 
          ? new Date(lastUpdated).toLocaleDateString('sv-SE')
          : null,
    };
  }, [allProjects, formatRelativeTime]);

  return (
    <>
      {/* Header with title and create button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        {/* Title removed - no company name or phase name needed */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {allProjects.length > 0 && (
            <Text style={{ fontSize: 14, color: '#888' }}>
              {allProjects.length} {allProjects.length === 1 ? 'projekt' : 'projekt'}
            </Text>
          )}
          {onCreateProject && (
            <TouchableOpacity
              onPress={onCreateProject}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#1976D2',
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
                gap: 6,
                ...(Platform.OS === 'web' ? {
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                } : {}),
              }}
              activeOpacity={0.8}
              onMouseEnter={Platform.OS === 'web' ? (e) => {
                e.currentTarget.style.backgroundColor = '#1565C0';
              } : undefined}
              onMouseLeave={Platform.OS === 'web' ? (e) => {
                e.currentTarget.style.backgroundColor = '#1976D2';
              } : undefined}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                Skapa nytt projekt
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Notifications Icon - Right side */}
        <TouchableOpacity
          onPress={() => setNotificationsOpen(true)}
          style={{
            position: 'relative',
            padding: 8,
            borderRadius: 8,
            backgroundColor: notificationsOpen ? '#E3F2FD' : 'transparent',
          }}
        >
          <Ionicons name="notifications-outline" size={24} color="#1976D2" />
          {unreadCount > 0 && (
            <View style={{
              position: 'absolute',
              top: 4,
              right: 4,
              backgroundColor: '#D32F2F',
              borderRadius: 10,
              minWidth: 18,
              height: 18,
              paddingHorizontal: 5,
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 2,
              borderColor: '#fff',
            }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      
      {/* Notifications Modal */}
      <Modal
        visible={notificationsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0,0,0,0.5)', 
          justifyContent: 'flex-end' 
        }}>
          <View style={{ 
            backgroundColor: '#fff', 
            borderTopLeftRadius: 20, 
            borderTopRightRadius: 20,
            maxHeight: '80%',
            paddingTop: 20,
            paddingBottom: Platform.OS === 'web' ? 20 : 40,
          }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingBottom: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#e0e0e0',
            }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#222' }}>
                Notiser
              </Text>
              <TouchableOpacity
                onPress={() => setNotificationsOpen(false)}
                style={{ padding: 8 }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
              {notifications.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="notifications-off-outline" size={48} color="#ccc" />
                  <Text style={{ color: '#888', fontSize: 15, marginTop: 12 }}>
                    Inga notiser än
                  </Text>
                </View>
              ) : (
                notifications.map((notification, index) => {
                  const actorName = notification.uid ? (nameMap[notification.uid] || 'Användare') : 'System';
                  const timestamp = notification.timestamp || notification.createdAt || notification.ts || notification.updatedAt;
                  const timeText = timestamp && formatRelativeTime 
                    ? formatRelativeTime(timestamp) 
                    : timestamp 
                      ? new Date(timestamp).toLocaleDateString('sv-SE', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '';
                  
                  return (
                    <View
                      key={notification.id || index}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderBottomWidth: index < notifications.length - 1 ? 1 : 0,
                        borderBottomColor: '#f0f0f0',
                      }}
                    >
                      <Text style={{ fontSize: 14, color: '#222', fontWeight: '500' }}>
                        {notification.message || notification.label || notification.eventType || notification.type || 'Ny aktivitet'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                        <Text style={{ fontSize: 12, color: '#666' }}>
                          {actorName}
                        </Text>
                        {timeText && (
                          <>
                            <Text style={{ fontSize: 12, color: '#999' }}>·</Text>
                            <Text style={{ fontSize: 12, color: '#999' }}>
                              {timeText}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Contextual guidance text */}
      {allProjects.length === 0 ? (
        <View style={{ 
          marginBottom: 16,
          padding: 16,
          backgroundColor: '#F8F9FA',
          borderRadius: 8,
          borderLeftWidth: 3,
          borderLeftColor: '#1976D2',
        }}>
          <Text style={{ fontSize: 14, color: '#495057', fontWeight: '500', marginBottom: 4 }}>
            Du har inte blivit tilldelad något projekt än
          </Text>
          <Text style={{ fontSize: 13, color: '#6C757D' }}>
            Projekt skapas i SharePoint och tilldelas i systemet. Kontakta din administratör för att bli tilldelad ett projekt.
          </Text>
        </View>
      ) : allProjects.length === 1 && projectSummary ? (
        <View style={{ 
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#F8F9FA',
          borderRadius: 8,
          borderLeftWidth: 3,
          borderLeftColor: '#43A047',
        }}>
          <Text style={{ fontSize: 13, color: '#495057' }}>
            <Text style={{ fontWeight: '600' }}>1 aktivt projekt</Text>
            {projectSummary.lastUpdatedText && (
              <Text> · Senast uppdaterat {projectSummary.lastUpdatedText}</Text>
            )}
          </Text>
        </View>
      ) : (
        <View style={{ 
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#F8F9FA',
          borderRadius: 8,
          borderLeftWidth: 3,
          borderLeftColor: '#1976D2',
        }}>
          <Text style={{ fontSize: 13, color: '#495057' }}>
            Välj ett projekt i listan för att fortsätta
          </Text>
        </View>
      )}
      
      {allProjects.length === 0 ? (
        <View style={{ 
          borderWidth: 1, 
          borderColor: '#e0e0e0', 
          borderRadius: 12, 
          padding: 40, 
          backgroundColor: '#fff',
          alignItems: 'center' 
        }}>
          <Ionicons name="folder-outline" size={48} color="#ccc" style={{ marginBottom: 12 }} />
          <Text style={{ color: '#777', fontSize: 15, textAlign: 'center', marginBottom: 8 }}>
            Inga projekt hittades
          </Text>
          <Text style={{ color: '#999', fontSize: 13, textAlign: 'center' }}>
            Projekt skapas i SharePoint och tilldelas i systemet. Kontakta din administratör för att bli tilldelad ett projekt.
          </Text>
        </View>
      ) : (
        <View style={{ 
          borderWidth: 1, 
          borderColor: '#e0e0e0', 
          borderRadius: 12, 
          backgroundColor: '#fff',
          overflow: 'hidden',
        }}>
          {/* Table Header */}
          <View style={tableHeaderStyle}>
            <View style={{ flex: 2.5, paddingRight: 8 }}>
              <Text style={tableHeaderTextStyle}>Projektnummer + projektnamn</Text>
            </View>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={tableHeaderTextStyle}>Fas</Text>
            </View>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={tableHeaderTextStyle}>Status</Text>
            </View>
            <View style={{ flex: 1.5, paddingRight: 8 }}>
              <Text style={tableHeaderTextStyle}>Senast uppdaterad</Text>
            </View>
            <View style={{ width: 32, alignItems: 'center' }}>
              {/* Space for arrow icon */}
            </View>
          </View>

          {/* Table Rows */}
          <ScrollView style={{ maxHeight: Platform.OS === 'web' ? 600 : 400 }}>
            {allProjects.map((project, idx) => {
              const projectPhase = project?.phase || 'kalkylskede';
              const phaseConfig = getPhaseConfig(projectPhase);
              const statusColor = getStatusColor(project.status);
              const statusLabel = getStatusLabel(project.status);
              const lastUpdated = project.updatedAt || project.createdAt || null;

              const renderRowContent = () => (
                <>
                  {/* Project Number + Name */}
                  <View style={{ flex: 2.5, paddingRight: 8, flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: phaseConfig.color,
                        marginRight: 8,
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text 
                        style={{ 
                          fontSize: 14, 
                          fontWeight: '500', 
                          color: '#222',
                          marginBottom: 2,
                        }} 
                        numberOfLines={1}
                      >
                        {project.id} — {project.name}
                      </Text>
                    </View>
                  </View>

                  {/* Phase */}
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View
                      style={{
                        backgroundColor: `${phaseConfig.color}15`,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 12,
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: phaseConfig.color,
                          fontWeight: '600',
                        }}
                      >
                        {phaseConfig.name}
                      </Text>
                    </View>
                  </View>

                  {/* Status */}
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: statusColor,
                          marginRight: 6,
                        }}
                      />
                      <Text style={{ fontSize: 13, color: '#333' }}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>

                  {/* Last Updated */}
                  <View style={{ flex: 1.5, paddingRight: 8 }}>
                    {lastUpdated && formatRelativeTime ? (
                      <Text style={{ fontSize: 13, color: '#888' }}>
                        {formatRelativeTime(lastUpdated)}
                      </Text>
                    ) : lastUpdated ? (
                      <Text style={{ fontSize: 13, color: '#888' }}>
                        {new Date(lastUpdated).toLocaleDateString('sv-SE')}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 13, color: '#ccc' }}>
                        —
                      </Text>
                    )}
                  </View>

                  {/* Arrow icon */}
                  {Platform.OS === 'web' ? (
                    <div 
                      style={{ 
                        width: 32, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}
                      data-arrow-container
                    >
                      <Ionicons 
                        name="chevron-forward" 
                        size={18} 
                        color="#ccc"
                        data-arrow-icon
                      />
                    </div>
                  ) : (
                    <View style={{ width: 32, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="chevron-forward" size={18} color="#ccc" />
                    </View>
                  )}
                </>
              );

              if (Platform.OS === 'web') {
                return (
                  <div
                    key={`${project.id}-${idx}`}
                    onClick={() => {
                      if (onProjectSelect) {
                        onProjectSelect(project);
                      }
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderBottomWidth: idx === allProjects.length - 1 ? 0 : 1,
                      borderBottomStyle: 'solid',
                      borderBottomColor: '#f0f0f0',
                      backgroundColor: '#fff',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#E3F2FD';
                      // Update arrow color on hover
                      const arrowIcon = e.currentTarget.querySelector('[data-arrow-icon]');
                      if (arrowIcon && arrowIcon.setNativeProps) {
                        arrowIcon.setNativeProps({ color: '#1976D2' });
                      } else if (arrowIcon) {
                        // For web, we need to update the style directly
                        arrowIcon.style.color = '#1976D2';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff';
                      // Reset arrow color
                      const arrowIcon = e.currentTarget.querySelector('[data-arrow-icon]');
                      if (arrowIcon && arrowIcon.setNativeProps) {
                        arrowIcon.setNativeProps({ color: '#ccc' });
                      } else if (arrowIcon) {
                        arrowIcon.style.color = '#ccc';
                      }
                    }}
                  >
                    {renderRowContent()}
                  </div>
                );
              }

              return (
                <TouchableOpacity
                  key={`${project.id}-${idx}`}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (onProjectSelect) {
                      onProjectSelect(project);
                    }
                  }}
                  style={[
                    tableRowStyle,
                    idx === allProjects.length - 1 && { borderBottomWidth: 0 },
                    Platform.OS === 'web' && {
                      ':hover': { backgroundColor: '#E3F2FD' },
                    },
                  ]}
                >
                  {renderRowContent()}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </>
  );
};

export default DashboardAllProjects;
