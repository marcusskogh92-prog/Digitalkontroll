/**
 * DashboardAllProjects - Shows all projects in a table format on the dashboard
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { subscribeCompanyProjectOrganisation, subscribeCompanyProjects } from '../../../components/firebase';
import { getPhaseConfig } from '../../../features/projects/constants';
import DashboardBanner from './DashboardBanner';
import { resolveProjectId } from './dashboardUtils';

const DashboardAllProjects = ({
  hierarchy = [],
  onProjectSelect,
  formatRelativeTime,
  companyName,
  onCreateProject,
  dashboardLoading = false,
  companyId = null,
  currentUserId = null,
  authClaims = null,
}) => {
  const DEBUG_MEMBERSHIP = !!(__DEV__ && Platform?.OS === 'web');

  const [memberProjectIds, setMemberProjectIds] = useState(() => new Set());
  const memberProjectIdsRef = useRef(memberProjectIds);
  useEffect(() => {
    memberProjectIdsRef.current = memberProjectIds;
  }, [memberProjectIds]);
  const [memberProjectsReady, setMemberProjectsReady] = useState(false);

  const [companyProjects, setCompanyProjects] = useState([]);
  const [companyProjectsReady, setCompanyProjectsReady] = useState(false);

  const isAdmin = !!(
    authClaims?.globalAdmin ||
    authClaims?.admin === true ||
    String(authClaims?.role || '').toLowerCase() === 'admin'
  );

  const effectiveCompanyId = useMemo(() => {
    const cid = String(companyId || authClaims?.companyId || '').trim();
    return cid || null;
  }, [companyId, authClaims?.companyId]);

  const membershipLoading = useMemo(() => {
    if (isAdmin) return false;
    const cid = String(effectiveCompanyId || '').trim();
    const uid = String(currentUserId || '').trim();
    if (!cid || !uid) return false;
    return !memberProjectsReady;
  }, [isAdmin, effectiveCompanyId, currentUserId, memberProjectsReady]);

  const projectsLoading = useMemo(() => {
    if (isAdmin) return false;
    const cid = String(effectiveCompanyId || '').trim();
    if (!cid) return false;
    return !companyProjectsReady;
  }, [isAdmin, effectiveCompanyId, companyProjectsReady]);

  useEffect(() => {
    const cid = String(effectiveCompanyId || '').trim();
    if (!cid) {
      setCompanyProjects([]);
      setCompanyProjectsReady(false);
      return;
    }

    setCompanyProjectsReady(false);
    const unsub = subscribeCompanyProjects(
      cid,
      { siteRole: 'projects' },
      (docs) => {
        try {
          setCompanyProjects(Array.isArray(docs) ? docs : []);
        } catch (_e) {
          setCompanyProjects([]);
        }
        setCompanyProjectsReady(true);
      },
      () => {
        setCompanyProjects([]);
        setCompanyProjectsReady(true);
      }
    );

    return () => {
      try { unsub?.(); } catch (_e) {}
    };
  }, [effectiveCompanyId]);

  useEffect(() => {
    const cid = String(effectiveCompanyId || '').trim();
    const uid = String(currentUserId || '').trim();

    if (DEBUG_MEMBERSHIP) {
      console.log('[dashboardAllProjects][membership] subscribe start', { cid, uid, isAdmin });
    }

    if (!cid || !uid) {
      setMemberProjectIds(new Set());
      setMemberProjectsReady(false);
      return;
    }

    setMemberProjectsReady(false);
    const unsub = subscribeCompanyProjectOrganisation(
      cid,
      (docs) => {
        const next = new Set();

        const normalizeToArray = (value) => {
          if (Array.isArray(value)) return value;
          if (value && typeof value === 'object') {
            try { return Object.values(value); } catch (_e) { return []; }
          }
          return [];
        };

        try {
          if (DEBUG_MEMBERSHIP) {
            console.log('[dashboardAllProjects][membership] raw org snapshot', {
              cid,
              uid,
              docsCount: Array.isArray(docs) ? docs.length : 0,
              sample: Array.isArray(docs) ? docs.slice(0, 3).map((d) => ({ id: d?.id, projectId: d?.projectId, projectNumber: d?.projectNumber })) : [],
            });
          }

          let compareCount = 0;
          for (const d of (docs || [])) {
            const groups = normalizeToArray(d?.groups);
            let isMember = false;

            if (DEBUG_MEMBERSHIP) {
              console.log('[dashboardAllProjects][membership] org doc', {
                docId: d?.id,
                projectId: d?.projectId,
                projectNumber: d?.projectNumber,
                groupsType: Array.isArray(d?.groups) ? 'array' : (d?.groups && typeof d?.groups === 'object' ? 'object' : typeof d?.groups),
                groupsCount: Array.isArray(groups) ? groups.length : 0,
              });
            }

            for (const g of groups) {
              const members = normalizeToArray(g?.members);

              if (DEBUG_MEMBERSHIP) {
                console.log('[dashboardAllProjects][membership] group', {
                  groupId: g?.id,
                  groupTitle: g?.title,
                  membersType: Array.isArray(g?.members) ? 'array' : (g?.members && typeof g?.members === 'object' ? 'object' : typeof g?.members),
                  membersCount: Array.isArray(members) ? members.length : 0,
                });
              }

              for (const m of members) {
                const refId = String(m?.refId || m?.uid || m?.userId || '').trim();
                if (DEBUG_MEMBERSHIP) {
                  compareCount += 1;
                  if (compareCount <= 500) {
                    console.log('[dashboardAllProjects][membership] compare member', {
                      currentUserId: uid,
                      memberRefId: refId,
                      memberSource: m?.source,
                      memberRole: m?.role,
                      memberName: m?.name,
                      match: !!(refId && refId === uid),
                    });
                  } else if (compareCount === 501) {
                    console.log('[dashboardAllProjects][membership] compare member: too many comparisons, truncating logs after 500');
                  }
                }
                if (!refId) continue;
                if (refId === uid) {
                  isMember = true;
                  break;
                }
              }
              if (isMember) break;
            }

            if (isMember) {
              const pid = String(d?.projectId || d?.id || '').trim();
              if (DEBUG_MEMBERSHIP) {
                console.log('[dashboardAllProjects][membership] member match => allow project', {
                  docId: d?.id,
                  projectId: d?.projectId,
                  projectNumber: d?.projectNumber,
                  derivedAllowedProjectId: pid,
                });
              }
              if (pid) next.add(pid);
            }
          }
        } catch (_e) {}

        if (DEBUG_MEMBERSHIP) {
          console.log('[dashboardAllProjects][membership] final memberProjectIds', Array.from(next));
        }
        setMemberProjectIds(next);
        setMemberProjectsReady(true);
      },
      () => {
        setMemberProjectIds(new Set());
        setMemberProjectsReady(true);
      }
    );

    return () => { try { unsub?.(); } catch(_e) {} };
  }, [effectiveCompanyId, currentUserId, DEBUG_MEMBERSHIP, isAdmin]);

  // Extract all projects from hierarchy (no phase filtering here anymore)
  const allProjects = useMemo(() => {
    // Primary source: canonical Firestore projects collection.
    // This avoids depending on SharePoint hierarchy shape (folders/files only).
    const out = [];
    try {
      const list = Array.isArray(companyProjects) ? companyProjects : [];
      if (list.length > 0) {
        for (const p of list) {
          const pid = resolveProjectId(p);
          if (!pid) continue;
          const pn = String(p?.projectNumber || p?.number || pid).trim();
          const name = String(p?.projectName || p?.name || p?.fullName || '').trim();
          out.push({
            ...p,
            id: pid,
            projectId: pid,
            number: pn,
            name: name || pn || pid,
            fullName: String(p?.fullName || `${pn} ${name}`.trim()).trim(),
          });
        }
      }
    } catch (_e) {}

    // Fallback: legacy hierarchy adapters that already emit child.type === 'project'.
    if (out.length === 0 && Array.isArray(hierarchy)) {
      try {
        hierarchy.forEach(main => {
          if (!main.children || !Array.isArray(main.children)) return;
          main.children.forEach(sub => {
            if (!sub.children || !Array.isArray(sub.children)) return;
            sub.children.forEach(child => {
              if (child.type === 'project') {
                const pid = resolveProjectId(child);
                out.push({
                  ...child,
                  id: pid || (child?.id != null ? String(child.id).trim() : null),
                  projectId: pid || (child?.projectId != null ? String(child.projectId).trim() : null),
                  mainFolder: main.name,
                  subFolder: sub.name,
                });
              }
            });
          });
        });
      } catch (_e) {}
    }

    out.sort((a, b) => {
      const aId = String(resolveProjectId(a) || '').toLowerCase();
      const bId = String(resolveProjectId(b) || '').toLowerCase();
      return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: 'base' });
    });
    return out;
  }, [hierarchy, companyProjects]);

  useEffect(() => {
    if (!DEBUG_MEMBERSHIP) return;
    const allProjectIds = (allProjects || []).map((p) => resolveProjectId(p)).filter(Boolean);
    console.log('[dashboardAllProjects][filter] pre-filter projects', {
      memberProjectsReady,
      companyProjectsReady,
      memberProjectIds: Array.from(memberProjectIds || []),
      allProjectIds,
    });
  }, [DEBUG_MEMBERSHIP, allProjects, memberProjectsReady, memberProjectIds, companyProjectsReady]);

  const visibleProjects = useMemo(() => {
    if (isAdmin) return allProjects;
    if (!memberProjectsReady) return [];
    const allowed = memberProjectIds;
    return (allProjects || []).filter((p) => {
      const pid = resolveProjectId(p);
      return pid && allowed.has(pid);
    });
  }, [allProjects, isAdmin, memberProjectsReady, memberProjectIds]);

  const tableHeaderStyle = useMemo(() => ({
    flexDirection: 'row',
    paddingVertical: 12,
    paddingLeft: 22,
    paddingRight: 12,
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
    paddingLeft: 22,
    paddingRight: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
    alignItems: 'center',
  }), []);

  // Calculate summary info for single project
  const projectSummary = useMemo(() => {
    if (visibleProjects.length !== 1) return null;
    const project = visibleProjects[0];
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
  }, [visibleProjects, formatRelativeTime]);

  return (
    <>
      {/* Contextual guidance text */}
      {membershipLoading ? (
        <DashboardBanner
          padding={16}
          accentColor="#1976D2"
          title="Läser dina projekt…"
          message="Hämtar projekt där du är tillagd i Organisation och roller."
        />
      ) : projectsLoading ? (
        <DashboardBanner
          padding={16}
          accentColor="#1976D2"
          title="Läser projektregistret…"
          message="Hämtar projektlistan från systemet."
        />
      ) : (companyProjectsReady && allProjects.length === 0) ? (
        <DashboardBanner
          padding={16}
          accentColor="#FF9800"
          title="Inga projekt finns ännu"
          message="Det finns inga projekt registrerade i systemet för det här företaget."
        />
      ) : (!isAdmin && memberProjectsReady && (memberProjectIds?.size || 0) === 0) ? (
        <DashboardBanner
          padding={16}
          accentColor="#1976D2"
          title="Du har inte blivit tilldelad något projekt än"
          message="Kontakta din administratör för att bli tilldelad ett projekt i Organisation och roller."
        />
      ) : visibleProjects.length === 0 ? (
        <DashboardBanner
          padding={16}
          accentColor="#1976D2"
          title="Inga av dina projekt hittades"
          message="Du är tilldelad projekt, men inga matchade i projektregistret. Kontrollera att projekten finns registrerade och att projektnumret (t.ex. 1010-10) är korrekt."
        />
      ) : visibleProjects.length === 1 && projectSummary ? (
        <DashboardBanner padding={12} accentColor="#43A047" title={null} message={null}>
          <Text style={{ fontSize: 13, color: '#495057' }}>
            <Text style={{ fontWeight: '600' }}>1 projekt</Text>
            {projectSummary.lastUpdatedText ? (
              <Text> · Senast uppdaterat {projectSummary.lastUpdatedText}</Text>
            ) : null}
          </Text>
        </DashboardBanner>
      ) : null}
      
      {membershipLoading ? (
        <View style={{ 
          borderWidth: 1, 
          borderColor: '#e0e0e0', 
          borderRadius: 12, 
          padding: 40, 
          backgroundColor: '#fff',
          alignItems: 'center' 
        }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8 }}>
            Laddar…
          </Text>
          <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', maxWidth: 420, lineHeight: 20 }}>
            Hämtar din projekttilldelning från Organisation och roller.
          </Text>
        </View>
      ) : projectsLoading ? (
        <View style={{ 
          borderWidth: 1, 
          borderColor: '#e0e0e0', 
          borderRadius: 12, 
          padding: 40, 
          backgroundColor: '#fff',
          alignItems: 'center' 
        }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8 }}>
            Laddar…
          </Text>
          <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', maxWidth: 420, lineHeight: 20 }}>
            Hämtar projektlistan från systemet.
          </Text>
        </View>
      ) : (companyProjectsReady && allProjects.length === 0) ? (
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
            Inga projekt finns ännu
          </Text>
          <Text style={{ color: '#999', fontSize: 13, textAlign: 'center' }}>
            Skapa ett projekt eller synka in projekt så att de syns i projektregistret.
          </Text>
        </View>
      ) : (!isAdmin && memberProjectsReady && (memberProjectIds?.size || 0) === 0) ? (
        <View style={{ 
          borderWidth: 1, 
          borderColor: '#e0e0e0', 
          borderRadius: 12, 
          padding: 40, 
          backgroundColor: '#fff',
          alignItems: 'center' 
        }}>
          <Ionicons name="person-outline" size={48} color="#ccc" style={{ marginBottom: 12 }} />
          <Text style={{ color: '#777', fontSize: 15, textAlign: 'center', marginBottom: 8 }}>
            Du har inte blivit tilldelad något projekt än
          </Text>
          <Text style={{ color: '#999', fontSize: 13, textAlign: 'center' }}>
            Kontakta din administratör för att bli tilldelad ett projekt i Organisation och roller.
          </Text>
        </View>
      ) : visibleProjects.length === 0 ? (
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
            Inga av dina projekt hittades
          </Text>
          <Text style={{ color: '#999', fontSize: 13, textAlign: 'center' }}>
            Du är tilldelad projekt, men de saknas i projektregistret. Kontrollera att projektet (t.ex. 1010-10) finns registrerat.
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
              <Text style={tableHeaderTextStyle}>Skede</Text>
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
            {visibleProjects.map((project, idx) => {
              const projectPhase = project?.phase || 'kalkylskede';
              const phaseConfig = getPhaseConfig(projectPhase);
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
                      paddingLeft: 18,
                      paddingRight: 12,
                      borderBottomWidth: idx === visibleProjects.length - 1 ? 0 : 1,
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
                    idx === visibleProjects.length - 1 && { borderBottomWidth: 0 },
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
