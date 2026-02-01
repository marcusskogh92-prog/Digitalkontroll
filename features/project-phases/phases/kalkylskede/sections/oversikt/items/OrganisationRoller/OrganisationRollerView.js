/**
 * OrganisationRollerView
 * (Översikt 02) – project-specific dynamic organisation groups + members.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import AddParticipantModal from '../../../../../../../../components/common/ProjectOrganisation/AddParticipantModal';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from '../../../../../../../../components/common/layoutConstants';
import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';
import { ensureDefaultProjectOrganisationGroup, fetchCompanyProfile } from '../../../../../../../../components/firebase';
import { useProjectOrganisation } from '../../../../../../../../hooks/useProjectOrganisation';

function confirmWebOrNative(message) {
  if (Platform.OS === 'web') return window.confirm(message);
  return new Promise((resolve) => {
    Alert.alert('Bekräfta', message, [
      { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Ta bort', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function buildExistingMemberKeys(group) {
  const out = {};
  const members = Array.isArray(group?.members) ? group.members : [];
  members.forEach((m) => {
    const source = String(m?.source || '').trim();
    const refId = String(m?.refId || '').trim();
    if (!source || !refId) return;
    out[`${source}:${refId}`] = true;
  });
  return out;
}

export default function OrganisationRollerView({ projectId, companyId, project, hidePageHeader = false }) {
  const COLORS = {
    blue: '#1976D2',
    blueHover: '#155FB5',
    neutral: '#6B7280',
    neutralHover: '#1976D2',
    border: '#E6E8EC',
    borderStrong: '#D1D5DB',
    bgMuted: '#F8FAFC',
    danger: '#DC2626',
    dangerHover: '#B91C1C',
    text: '#111',
    textMuted: '#475569',
    textSubtle: '#64748b',
    inputBorder: '#E2E8F0',
    tableBorder: '#EEF0F3',
    tableHeaderText: '#64748b',
    groupTitle: '#334155',
  };

  const { groups, loading, error, addGroup, removeGroup, updateGroupTitle, addMember, removeMember, updateMemberRole } =
    useProjectOrganisation({ companyId, projectId });

  const [defaultGroupEnsured, setDefaultGroupEnsured] = useState(false);

  const [activeModalGroupId, setActiveModalGroupId] = useState(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => ({}));
  const [expandedInitialized, setExpandedInitialized] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const activeGroup = useMemo(
    () => (groups || []).find((g) => String(g?.id || '') === String(activeModalGroupId || '')) || null,
    [groups, activeModalGroupId]
  );

  const existingMemberKeys = useMemo(() => buildExistingMemberKeys(activeGroup), [activeGroup]);

  const hasContext = String(companyId || '').trim() && String(projectId || '').trim();

  // Ensure a default internal main group exists if the project currently has no groups.
  // This makes the group visible immediately when opening the view, even if project creation
  // didn't get a chance to run the initializer.
  useEffect(() => {
    if (!hasContext) return;
    if (defaultGroupEnsured) return;
    if (loading) return;
    if (error) return;
    const list = Array.isArray(groups) ? groups : [];
    if (list.length > 0) {
      setDefaultGroupEnsured(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchCompanyProfile(companyId);
        const companyName = String(profile?.companyName || profile?.name || companyId).trim();
        await ensureDefaultProjectOrganisationGroup(companyId, projectId, { companyName });
      } catch (_e) {
        // ignore: view will just remain empty and user can still add groups manually
      } finally {
        if (!cancelled) setDefaultGroupEnsured(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasContext, defaultGroupEnsured, loading, error, groups, companyId, projectId]);

  // Default: all groups open on first load.
  useEffect(() => {
    if (expandedInitialized) return;
    const list = Array.isArray(groups) ? groups : [];
    if (list.length === 0) return;
    const next = {};
    list.forEach((g) => {
      const id = String(g?.id || '').trim();
      if (id) next[id] = true;
    });
    setExpandedGroupIds(next);
    setExpandedInitialized(true);
  }, [groups, expandedInitialized]);

  // If new groups appear later, keep them open by default.
  useEffect(() => {
    if (!expandedInitialized) return;
    const list = Array.isArray(groups) ? groups : [];
    if (list.length === 0) return;
    const incomingIds = list.map((g) => String(g?.id || '').trim()).filter(Boolean);
    setExpandedGroupIds((prev) => {
      let changed = false;
      const next = { ...(prev || {}) };
      incomingIds.forEach((id) => {
        if (!(id in next)) {
          next[id] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [groups, expandedInitialized]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: 18, paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER }}>
      {!hidePageHeader ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Ionicons name="people-outline" size={22} color={COLORS.neutral} style={{ marginRight: 10 }} />
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text style={[PROJECT_TYPOGRAPHY.viewTitle, { color: COLORS.text }]} numberOfLines={1}>
              Organisation och roller
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={[PROJECT_TYPOGRAPHY.introText, { color: COLORS.textMuted, marginBottom: 14 }]}>
        Skapa egna grupper och lägg till personer från interna användare eller kontaktregistret. Roller är fria texter per projekt.
      </Text>

      {!hasContext ? (
        <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082', marginBottom: 14 }}>
          <Text style={{ fontSize: 13, color: '#5D4037' }}>Saknar projectId/companyId – kan inte ladda organisationsdata.</Text>
        </View>
      ) : null}

      {error ? (
        <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', marginBottom: 14 }}>
          <Text style={{ fontSize: 13, color: '#C62828' }}>{error}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <Text style={[PROJECT_TYPOGRAPHY.sectionHeading, { color: COLORS.text }]}>
          Grupper ({Array.isArray(groups) ? groups.length : 0})
        </Text>
        <Pressable
          onPress={() => addGroup({ title: 'Ny grupp' })}
          disabled={!hasContext}
          style={({ hovered, pressed }) => {
            const disabled = !hasContext;
            const bg = disabled ? '#9CA3AF' : (hovered || pressed ? COLORS.blueHover : COLORS.blue);
            return {
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 10,
              backgroundColor: bg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            };
          }}
        >
          <Ionicons name="add-outline" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Lägg till grupp</Text>
        </Pressable>
      </View>

      {loading ? (
        <Text style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>Laddar…</Text>
      ) : null}

      {(Array.isArray(groups) ? groups : []).length === 0 ? (
        <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, backgroundColor: COLORS.bgMuted }}>
          <Text style={{ fontSize: 14, color: COLORS.text, fontWeight: '800', marginBottom: 6 }}>Inga grupper ännu</Text>
          <Text style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 18 }}>
            Klicka “Lägg till grupp” för att skapa en struktur som passar projektet.
          </Text>
        </View>
      ) : null}

      {(Array.isArray(groups) ? groups : []).map((group) => {
        const gid = String(group?.id || '');
        const members = Array.isArray(group?.members) ? group.members : [];
        const participantCount = members.length;
        const isOpen = expandedGroupIds[gid] !== false; // default open
        const isLockedGroup = group?.locked === true || group?.isInternalMainGroup === true || gid === 'internal-main';

        const toggleOpen = () => {
          if (String(editingGroupId || '') === gid) return;
          setExpandedGroupIds((prev) => {
            const currentlyOpen = prev && prev[gid] !== false;
            return { ...(prev || {}), [gid]: !currentlyOpen };
          });
        };

        return (
          <View
            key={gid}
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 8,
              backgroundColor: '#fff',
              marginBottom: 8,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                borderBottomWidth: isOpen ? 1 : 0,
                borderBottomColor: COLORS.tableBorder,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                paddingVertical: 6,
                paddingHorizontal: 12,
                backgroundColor: '#fff',
              }}
            >
              <Pressable
                onPress={toggleOpen}
                style={({ hovered, pressed }) => ({
                  flex: 1,
                  minWidth: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 2,
                  paddingHorizontal: 0,
                  backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'transparent',
                  borderRadius: 8,
                })}
              >
                <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={COLORS.neutral} />

                <View style={{ minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    defaultValue={String(group?.title || '')}
                    placeholder="Gruppens rubrik"
                    placeholderTextColor="#94A3B8"
                    onFocus={() => setEditingGroupId(gid)}
                    onBlur={(e) => {
                      setEditingGroupId(null);
                      const next = String(e?.nativeEvent?.text ?? group?.title ?? '').trim();
                      if (next !== String(group?.title || '').trim()) updateGroupTitle(gid, next);
                    }}
                    style={{
                      minWidth: 180,
                      maxWidth: Platform.OS === 'web' ? 520 : 260,
                      flexShrink: 1,
                      fontSize: 13,
                      color: COLORS.groupTitle,
                      fontWeight: '500',
                      paddingVertical: 2,
                      paddingHorizontal: 0,
                      backgroundColor: 'transparent',
                      ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                    }}
                  />
                  {isLockedGroup ? (
                    <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#3730A3' }}>Intern huvudgrupp</Text>
                    </View>
                  ) : null}
                  <Text style={{ fontSize: 13, color: COLORS.textSubtle, fontWeight: '600' }}>({participantCount})</Text>
                </View>
              </Pressable>

              {!isOpen ? null : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable
                    onPress={() => setActiveModalGroupId(gid)}
                    disabled={!hasContext}
                    style={({ hovered, pressed }) => {
                      const disabled = !hasContext;
                      const borderColor = disabled ? COLORS.borderStrong : COLORS.blue;
                      const bg = disabled ? '#F3F4F6' : (hovered || pressed ? '#EFF6FF' : '#fff');
                      return {
                        paddingVertical: 6,
                        paddingHorizontal: 8,
                        borderRadius: 10,
                        backgroundColor: bg,
                        borderWidth: 1,
                        borderColor,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      };
                    }}
                  >
                    <Ionicons name="person-add-outline" size={15} color={hasContext ? COLORS.blue : COLORS.neutral} />
                    <Text style={{ color: hasContext ? COLORS.blue : COLORS.neutral, fontWeight: '700', fontSize: 12 }}>Lägg till</Text>
                  </Pressable>

                  <Pressable
                    onPress={async () => {
                      if (isLockedGroup) return;
                      const ok = await confirmWebOrNative('Ta bort gruppen? Detta tar även bort alla personer i gruppen.');
                      if (ok) removeGroup(gid);
                    }}
                    disabled={isLockedGroup}
                    title={Platform.OS === 'web' ? 'Ta bort grupp' : undefined}
                    style={({ hovered, pressed }) => {
                      if (isLockedGroup) {
                        return {
                          paddingVertical: 6,
                          paddingHorizontal: 8,
                          borderRadius: 10,
                          backgroundColor: '#F8FAFC',
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          opacity: 0.55,
                        };
                      }
                      const hot = !!(hovered || pressed);
                      return {
                        paddingVertical: 6,
                        paddingHorizontal: 8,
                        borderRadius: 10,
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: hot ? COLORS.danger : COLORS.borderStrong,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      };
                    }}
                  >
                    {({ hovered, pressed }) => {
                      if (isLockedGroup) {
                        return (
                          <>
                            <Ionicons name="lock-closed-outline" size={15} color={COLORS.neutral} />
                            <Text style={{ color: COLORS.neutral, fontWeight: '700', fontSize: 12 }}>Låst</Text>
                          </>
                        );
                      }
                      const hot = !!(hovered || pressed);
                      const c = hot ? COLORS.danger : COLORS.neutral;
                      return (
                        <>
                          <Ionicons name="trash-outline" size={15} color={c} />
                          <Text style={{ color: c, fontWeight: '700', fontSize: 12 }}>Ta bort</Text>
                        </>
                      );
                    }}
                  </Pressable>
                </View>
              )}
            </View>

            {!isOpen ? null : (
              <View style={{ paddingHorizontal: 12, paddingBottom: 10, paddingTop: 8, backgroundColor: '#fff' }}>
                <View style={{ borderTopWidth: 1, borderTopColor: COLORS.tableBorder }}>
                  <View style={{ paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', gap: 10 }}>
                    <Text style={{ flex: 0.9, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Roll</Text>
                    <Text style={{ flex: 1.25, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Namn</Text>
                    <Text style={{ flex: 1.1, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Företag</Text>
                    <Text style={{ flex: 1.25, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>E-post</Text>
                    <Text style={{ flex: 0.95, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Telefon</Text>
                    <Text style={{ width: 40, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText, textAlign: 'right' }}>Ta bort</Text>
                  </View>

                  {members.length === 0 ? (
                    <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: COLORS.tableBorder }}>
                      <Text style={{ color: COLORS.textSubtle, fontSize: 13 }}>Inga deltagare i gruppen.</Text>
                    </View>
                  ) : (
                    members.map((m) => {
                      const mid = String(m?.id || '');
                      return (
                        <View key={mid} style={{ paddingVertical: 5, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: COLORS.tableBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <TextInput
                            defaultValue={String(m?.role || '')}
                            placeholder="Roll"
                            placeholderTextColor="#94A3B8"
                            onBlur={(e) => {
                              const nextRole = String(e?.nativeEvent?.text ?? m?.role ?? '').trim();
                              if (nextRole !== String(m?.role || '').trim()) {
                                updateMemberRole({ groupId: gid, memberId: mid, role: nextRole });
                              }
                            }}
                            style={{
                              flex: 0.9,
                              flexBasis: 0,
                              flexShrink: 1,
                              minWidth: 0,
                              borderWidth: 1,
                              borderColor: COLORS.inputBorder,
                              borderRadius: 8,
                              paddingVertical: 4,
                              paddingHorizontal: 6,
                              fontSize: 12,
                              color: COLORS.text,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                            }}
                          />
                          <Text style={{ flex: 1.25, flexBasis: 0, minWidth: 0, fontSize: 13, fontWeight: '400', color: COLORS.text }} numberOfLines={1}>
                            {String(m?.name || '—')}
                          </Text>
                          <Text style={{ flex: 1.1, flexBasis: 0, minWidth: 0, fontSize: 13, color: COLORS.textMuted }} numberOfLines={1}>
                            {String(m?.company || '—')}
                          </Text>
                          <Text style={{ flex: 1.25, flexBasis: 0, minWidth: 0, fontSize: 13, color: COLORS.textMuted }} numberOfLines={1}>
                            {String(m?.email || '—')}
                          </Text>
                          <Text style={{ flex: 0.95, flexBasis: 0, minWidth: 0, fontSize: 13, color: COLORS.textMuted }} numberOfLines={1}>
                            {String(m?.phone || '—')}
                          </Text>
                          <View style={{ width: 40, alignItems: 'flex-end' }}>
                            <Pressable
                              onPress={() => removeMember({ groupId: gid, memberId: mid })}
                              title={Platform.OS === 'web' ? 'Ta bort deltagare' : undefined}
                              style={({ hovered, pressed }) => ({
                                paddingVertical: 4,
                                paddingHorizontal: 4,
                                borderRadius: 8,
                                backgroundColor: (hovered || pressed) ? 'rgba(220, 38, 38, 0.08)' : 'transparent',
                              })}
                            >
                              <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            )}
          </View>
        );
      })}

      <AddParticipantModal
        visible={!!activeModalGroupId}
        onClose={() => setActiveModalGroupId(null)}
        companyId={companyId}
        existingMemberKeys={existingMemberKeys}
        onAdd={async (candidate, role) => {
          const res = await addMember({ groupId: activeModalGroupId, candidate, role });
          if (res && res.ok === false && res.reason === 'duplicate') {
            throw new Error('Personen finns redan i gruppen.');
          }
          if (res && res.ok === false) {
            throw new Error('Kunde inte lägga till deltagare.');
          }
        }}
      />
    </ScrollView>
  );
}
