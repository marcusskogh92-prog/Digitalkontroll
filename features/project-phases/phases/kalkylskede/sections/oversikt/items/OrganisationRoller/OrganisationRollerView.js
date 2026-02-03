/**
 * OrganisationRollerView
 * (Översikt 02) – project-specific dynamic organisation groups + members.
 */

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from '../../../../../../../../components/common/layoutConstants';
import AddParticipantModal from '../../../../../../../../components/common/ProjectOrganisation/AddParticipantModal';
import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';
import ContextMenu from '../../../../../../../../components/ContextMenu';
import { ensureDefaultProjectOrganisationGroup, fetchCompanyProfile } from '../../../../../../../../components/firebase';
import { useProjectOrganisation } from '../../../../../../../../hooks/useProjectOrganisation';

const COMPANY_GROUP_ROLE_PRESETS = [
  'Ombud',
  'Kalkylansvarig',
  'Projekteringsledare',
  'Projektchef',
  'Platschef',
  'Arbetsledare',
  'Inköp',
  'Offertintag',
  'Konstruktion',
  'BAS-P',
  'BAS-U',
];

function isPresetCompanyRole(role) {
  const r = String(role || '').trim();
  if (!r) return false;
  return COMPANY_GROUP_ROLE_PRESETS.includes(r);
}

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

function makePendingMemberFromCandidate(candidate) {
  const c = candidate || {};
  const source = String(c?.source || '').trim();
  const refId = String(c?.refId || '').trim();
  const id = `tmp:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    source,
    refId,
    name: String(c?.name || '—').trim(),
    company: String(c?.company || '—').trim(),
    email: String(c?.email || '').trim(),
    phone: String(c?.phone || '').trim(),
    role: String(c?.role || '').trim(),
    _pendingAdded: true,
  };
}

function pendingHasChanges(p) {
  if (!p || typeof p !== 'object') return false;
  const addedCount = p?.added && typeof p.added === 'object' ? Object.keys(p.added).length : 0;
  const removedCount = p?.removed && typeof p.removed === 'object' ? Object.keys(p.removed).length : 0;
  const roleCount = p?.roles && typeof p.roles === 'object' ? Object.keys(p.roles).length : 0;
  return (addedCount + removedCount + roleCount) > 0;
}

function computeDisplayMembers(baseMembers, pending) {
  const removed = pending?.removed && typeof pending.removed === 'object' ? pending.removed : {};
  const roles = pending?.roles && typeof pending.roles === 'object' ? pending.roles : {};
  const added = pending?.added && typeof pending.added === 'object' ? pending.added : {};

  const list = (Array.isArray(baseMembers) ? baseMembers : [])
    .filter((m) => !removed[String(m?.id || '').trim()])
    .map((m) => {
      const mid = String(m?.id || '').trim();
      const role = (mid && (mid in roles)) ? String(roles[mid] || '').trim() : String(m?.role || '').trim();
      const dirtyRole = (mid && (mid in roles)) ? true : false;
      return { ...m, role, _pendingRole: dirtyRole };
    });

  const addedList = Object.values(added).map((pm) => {
    const mid = String(pm?.id || '').trim();
    const role = (mid && (mid in roles)) ? String(roles[mid] || '').trim() : String(pm?.role || '').trim();
    const dirtyRole = (mid && (mid in roles)) ? true : false;
    return { ...pm, role, _pendingRole: dirtyRole, _pendingAdded: true };
  });

  return [...list, ...addedList];
}

export default function OrganisationRollerView({ projectId, companyId, project, hidePageHeader = false }) {
  const navigation = useNavigation();
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

  const [roleMenuVisible, setRoleMenuVisible] = useState(false);
  const [roleMenuPos, setRoleMenuPos] = useState({ x: 20, y: 64 });
  const [roleMenuTarget, setRoleMenuTarget] = useState(null); // { groupId, memberId, displayRole, baseRole }
  const [roleEditTarget, setRoleEditTarget] = useState(null); // { groupId, memberId }
  const [roleEditText, setRoleEditText] = useState('');

  // Pending changes per group (golden rule): do not write to backend until user hits Save.
  // Structure: { [gid]: { added: { [tmpId]: memberObj }, removed: { [memberId]: true }, roles: { [memberIdOrTmpId]: roleString } } }
  const [pendingByGroup, setPendingByGroup] = useState(() => ({}));
  const [savingGroupId, setSavingGroupId] = useState(null);
  const [savedFlashByGroup, setSavedFlashByGroup] = useState(() => ({}));

  const dirtyRef = useRef(false);
  const pendingAny = useMemo(() => {
    const map = pendingByGroup && typeof pendingByGroup === 'object' ? pendingByGroup : {};
    return Object.keys(map).some((gid) => pendingHasChanges(map[gid]));
  }, [pendingByGroup]);

  useEffect(() => {
    dirtyRef.current = !!pendingAny;
  }, [pendingAny]);
  const activeGroup = useMemo(
    () => (groups || []).find((g) => String(g?.id || '') === String(activeModalGroupId || '')) || null,
    [groups, activeModalGroupId]
  );

  const activeIsLockedGroup = useMemo(() => {
    const gid = String(activeGroup?.id || '').trim();
    return activeGroup?.locked === true || activeGroup?.isInternalMainGroup === true || gid === 'internal-main';
  }, [activeGroup]);

  const existingMemberKeys = useMemo(() => buildExistingMemberKeys(activeGroup), [activeGroup]);

  const activeExistingMemberKeys = useMemo(() => {
    const keys = { ...(existingMemberKeys || {}) };
    const gid = String(activeModalGroupId || '').trim();
    if (!gid) return keys;
    const pending = pendingByGroup && typeof pendingByGroup === 'object' ? pendingByGroup[gid] : null;
    const added = pending?.added && typeof pending.added === 'object' ? pending.added : null;
    if (!added) return keys;
    Object.values(added).forEach((m) => {
      const src = String(m?.source || '').trim();
      const refId = String(m?.refId || '').trim();
      if (!src || !refId) return;
      keys[`${src}:${refId}`] = true;
    });
    return keys;
  }, [existingMemberKeys, activeModalGroupId, pendingByGroup]);

  const hasContext = String(companyId || '').trim() && String(projectId || '').trim();

  // Navigation guard: warn when leaving with unsaved Organisation & roller changes.
  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      const msg = 'Du har osparade ändringar i Organisation & roller. Vill du lämna utan att spara?';
      if (Platform.OS === 'web') {
        const ok = window.confirm(msg);
        if (ok) navigation.dispatch(e.data.action);
        return;
      }
      Alert.alert('Osparade ändringar', msg, [
        { text: 'Stanna kvar', style: 'cancel' },
        { text: 'Lämna', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    const onBeforeUnload = (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      try { window.removeEventListener('beforeunload', onBeforeUnload); } catch (_e) {}
    };
  }, []);

  const getPendingForGroup = (gid) => {
    const id = String(gid || '').trim();
    const map = pendingByGroup && typeof pendingByGroup === 'object' ? pendingByGroup : {};
    const p = map[id];
    return {
      added: (p?.added && typeof p.added === 'object') ? p.added : {},
      removed: (p?.removed && typeof p.removed === 'object') ? p.removed : {},
      roles: (p?.roles && typeof p.roles === 'object') ? p.roles : {},
    };
  };

  const setPendingForGroup = (gid, next) => {
    const id = String(gid || '').trim();
    if (!id) return;
    setPendingByGroup((prev) => {
      const p = prev && typeof prev === 'object' ? prev : {};
      const merged = { ...(p || {}) };
      const normalized = {
        added: (next?.added && typeof next.added === 'object') ? next.added : {},
        removed: (next?.removed && typeof next.removed === 'object') ? next.removed : {},
        roles: (next?.roles && typeof next.roles === 'object') ? next.roles : {},
      };
      if (!pendingHasChanges(normalized)) {
        delete merged[id];
        return merged;
      }
      merged[id] = normalized;
      return merged;
    });
  };

  const stageAddCandidates = (gid, candidates) => {
    const id = String(gid || '').trim();
    if (!id) return;
    const list = Array.isArray(candidates) ? candidates : [];
    if (list.length === 0) return;
    setPendingByGroup((prev) => {
      const p = prev && typeof prev === 'object' ? prev : {};
      const existing = p[id] || { added: {}, removed: {}, roles: {} };
      const next = {
        added: { ...(existing.added || {}) },
        removed: { ...(existing.removed || {}) },
        roles: { ...(existing.roles || {}) },
      };

      const alreadyKeys = new Set();
      const group = (Array.isArray(groups) ? groups : []).find((g) => String(g?.id || '') === id) || null;
      (Array.isArray(group?.members) ? group.members : []).forEach((m) => {
        const src = String(m?.source || '').trim();
        const refId = String(m?.refId || '').trim();
        if (src && refId) alreadyKeys.add(`${src}:${refId}`);
      });
      Object.values(next.added).forEach((m) => {
        const src = String(m?.source || '').trim();
        const refId = String(m?.refId || '').trim();
        if (src && refId) alreadyKeys.add(`${src}:${refId}`);
      });

      list.forEach((c) => {
        const src = String(c?.source || '').trim();
        const refId = String(c?.refId || '').trim();
        if (!src || !refId) return;
        const key = `${src}:${refId}`;
        if (alreadyKeys.has(key)) return;
        const pm = makePendingMemberFromCandidate(c);
        next.added[pm.id] = pm;
        // Default role can be empty; user can set role before saving.
        if (String(pm?.role || '').trim()) next.roles[pm.id] = String(pm.role).trim();
        alreadyKeys.add(key);
      });

      const merged = { ...(p || {}) };
      if (!pendingHasChanges(next)) {
        delete merged[id];
        return merged;
      }
      merged[id] = next;
      return merged;
    });
  };

  const stageRemoveMember = (gid, memberId) => {
    const id = String(gid || '').trim();
    const mid = String(memberId || '').trim();
    if (!id || !mid) return;
    const pending = getPendingForGroup(id);
    const next = {
      added: { ...(pending.added || {}) },
      removed: { ...(pending.removed || {}) },
      roles: { ...(pending.roles || {}) },
    };
    if (next.added[mid]) {
      delete next.added[mid];
      delete next.roles[mid];
      setPendingForGroup(id, next);
      return;
    }
    next.removed[mid] = true;
    delete next.roles[mid];
    setPendingForGroup(id, next);
  };

  const stageRoleChange = (gid, memberId, nextRole, baseRole) => {
    const id = String(gid || '').trim();
    const mid = String(memberId || '').trim();
    if (!id || !mid) return;
    const nr = String(nextRole || '').trim();
    const br = String(baseRole || '').trim();
    const pending = getPendingForGroup(id);
    const next = {
      added: { ...(pending.added || {}) },
      removed: { ...(pending.removed || {}) },
      roles: { ...(pending.roles || {}) },
    };
    if (nr === br) delete next.roles[mid];
    else next.roles[mid] = nr;
    setPendingForGroup(id, next);
  };

  const cancelGroupChanges = (gid) => {
    const id = String(gid || '').trim();
    if (!id) return;
    setPendingByGroup((prev) => {
      const p = prev && typeof prev === 'object' ? prev : {};
      if (!p[id]) return prev;
      const next = { ...p };
      delete next[id];
      return next;
    });
  };

  const saveGroupChanges = async (gid) => {
    const id = String(gid || '').trim();
    if (!id) return;
    const pending = getPendingForGroup(id);
    if (!pendingHasChanges(pending)) return;
    if (!hasContext) return;
    if (savingGroupId) return;

    setSavingGroupId(id);
    try {
      // 1) Remove members
      const removedIds = Object.keys(pending.removed || {});
      for (const mid of removedIds) {
        await removeMember({ groupId: id, memberId: mid });
      }

      // 2) Add members (with role if staged)
      const addedMembers = Object.values(pending.added || {});
      for (const pm of addedMembers) {
        const candidate = {
          source: String(pm?.source || '').trim(),
          refId: String(pm?.refId || '').trim(),
          name: String(pm?.name || '').trim(),
          company: String(pm?.company || '').trim(),
          email: String(pm?.email || '').trim(),
          phone: String(pm?.phone || '').trim(),
        };
        const role = String((pending.roles && pending.roles[pm.id]) ?? pm?.role ?? '').trim();
        const res = await addMember({ groupId: id, candidate, role });
        if (res && res.ok === false && res.reason === 'duplicate') {
          // If backend says duplicate, treat as already added elsewhere.
          continue;
        }
        if (res && res.ok === false) {
          throw new Error('Kunde inte lägga till deltagare.');
        }
      }

      // 3) Update roles for existing members (skip removed + skip tmp ids)
      const roleEntries = Object.entries(pending.roles || {});
      for (const [mid, role] of roleEntries) {
        if (String(mid).startsWith('tmp:')) continue;
        if (pending.removed && pending.removed[mid]) continue;
        await updateMemberRole({ groupId: id, memberId: mid, role: String(role || '').trim() });
      }

      // Clear pending for group
      cancelGroupChanges(id);
      setSavedFlashByGroup((prev) => ({ ...(prev || {}), [id]: Date.now() }));
      setTimeout(() => {
        setSavedFlashByGroup((prev) => {
          const p = prev && typeof prev === 'object' ? prev : {};
          if (!p[id]) return prev;
          const next = { ...p };
          delete next[id];
          return next;
        });
      }, 1200);
    } catch (e) {
      const msg = String(e?.message || e || 'Kunde inte spara ändringar.');
      Alert.alert('Fel', msg);
    } finally {
      setSavingGroupId((prev) => (String(prev || '') === id ? null : prev));
    }
  };

  const closeRoleMenu = () => {
    setRoleMenuVisible(false);
    setRoleMenuTarget(null);
  };

  const beginRoleEdit = ({ groupId, memberId, currentRole }) => {
    setRoleEditTarget({ groupId: String(groupId || ''), memberId: String(memberId || '') });
    setRoleEditText(String(currentRole || '').trim());
  };

  const commitRoleEdit = ({ groupId, memberId, prevRole, baseRole }) => {
    const nextRole = String(roleEditText || '').trim();
    stageRoleChange(String(groupId || ''), String(memberId || ''), nextRole, String(baseRole ?? prevRole ?? '').trim());
    setRoleEditTarget(null);
    setRoleEditText('');
  };

  const openRolePicker = (e, { groupId, memberId, displayRole, baseRole }) => {
    const gid = String(groupId || '').trim();
    const mid = String(memberId || '').trim();
    const role = String(displayRole || '').trim();
    const base = String(baseRole || '').trim();
    if (!gid || !mid) return;

    if (Platform.OS !== 'web') {
      // Native fallback: use Alert. Not as compact as web dropdown, but keeps flow inline.
      const buttons = [
        ...COMPANY_GROUP_ROLE_PRESETS.map((label) => ({
          text: label,
          onPress: () => stageRoleChange(gid, mid, label, base),
        })),
        { text: 'Valfri roll (egen text)', onPress: () => beginRoleEdit({ groupId: gid, memberId: mid, currentRole: role }) },
        { text: 'Avbryt', style: 'cancel' },
      ];
      Alert.alert('Välj roll', 'Välj en fördefinierad roll eller skriv en egen.', buttons);
      return;
    }

    try {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

      const ne = e?.nativeEvent || e;
      const x = Number(ne?.pageX ?? ne?.clientX ?? ne?.locationX ?? 20);
      const y = Number(ne?.pageY ?? ne?.clientY ?? ne?.locationY ?? 64);
      setRoleMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    } catch (_e) {
      setRoleMenuPos({ x: 20, y: 64 });
    }

    setRoleMenuTarget({ groupId: gid, memberId: mid, displayRole: role, baseRole: base });
    setRoleMenuVisible(true);
  };

  const roleMenuItems = useMemo(() => {
    const t = roleMenuTarget;
    const current = String(t?.displayRole || '').trim();
    return [
      ...COMPANY_GROUP_ROLE_PRESETS.map((label) => ({
        key: `preset:${label}`,
        label,
        isSelected: current === label,
      })),
      { key: 'sep-custom', isSeparator: true },
      { key: 'custom', label: 'Valfri roll (egen text)', iconName: 'create-outline' },
    ];
  }, [roleMenuTarget]);

  // Ensure the mandatory company group exists and is named exactly as the company.
  // This is the "anchor" group for membership → dashboard/notifications.
  useEffect(() => {
    if (!hasContext) return;
    if (defaultGroupEnsured) return;
    if (loading) return;
    if (error) return;

    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchCompanyProfile(companyId);
        const companyName = String(profile?.companyName || profile?.name || companyId).trim();
        await ensureDefaultProjectOrganisationGroup(companyId, projectId, { companyName });
      } catch (_e) {
        // ignore: user can still work with groups; this is best-effort
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
        const baseMembers = Array.isArray(group?.members) ? group.members : [];
        const isOpen = expandedGroupIds[gid] !== false; // default open
        const isLockedGroup = group?.locked === true || group?.isInternalMainGroup === true || gid === 'internal-main';

        const pending = getPendingForGroup(gid);
        const displayMembers = computeDisplayMembers(baseMembers, pending);

        const participantCount = displayMembers.length;
        const groupHasPending = pendingHasChanges(pending);
        const flashSaved = !!(savedFlashByGroup && savedFlashByGroup[gid]);

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

                <View style={{ minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {/* Left: group title + participant count as one unit */}
                  <View style={{ minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      defaultValue={String(group?.title || '')}
                      placeholder="Gruppens rubrik"
                      placeholderTextColor="#94A3B8"
                      onFocus={() => setEditingGroupId(gid)}
                      onBlur={(e) => {
                        setEditingGroupId(null);
                        if (isLockedGroup) return;
                        const next = String(e?.nativeEvent?.text ?? group?.title ?? '').trim();
                        if (next !== String(group?.title || '').trim()) updateGroupTitle(gid, next);
                      }}
                      editable={!isLockedGroup}
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
                    <Text style={{ fontSize: 13, color: COLORS.textSubtle, fontWeight: '600' }}>({participantCount})</Text>
                  </View>

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
                    title={Platform.OS === 'web'
                      ? (isLockedGroup ? 'Systemstyrd grupp – kan inte raderas' : 'Ta bort grupp')
                      : undefined}
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
                            <Text style={{ color: COLORS.neutral, fontWeight: '700', fontSize: 12 }}>Kan inte raderas</Text>
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
                  {(groupHasPending || flashSaved) ? (
                    <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: COLORS.tableBorder, backgroundColor: groupHasPending ? '#FFF7ED' : '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 40 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                        {groupHasPending ? (
                          <Ionicons name="time-outline" size={16} color="#C2410C" />
                        ) : (
                          <Ionicons name="checkmark-circle-outline" size={16} color="#15803D" />
                        )}
                        <Text style={{ fontSize: 12, fontWeight: '700', color: groupHasPending ? '#9A3412' : '#166534' }} numberOfLines={1}>
                          {groupHasPending ? 'Osparade ändringar' : 'Ändringar sparade'}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Pressable
                          onPress={() => cancelGroupChanges(gid)}
                          disabled={!groupHasPending || savingGroupId === gid}
                          style={({ hovered, pressed }) => {
                            const disabled = !groupHasPending || savingGroupId === gid;
                            const hot = hovered || pressed;
                            return {
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 10,
                              backgroundColor: disabled ? '#F3F4F6' : (hot ? '#EEF2FF' : '#fff'),
                              borderWidth: 1,
                              borderColor: disabled ? COLORS.border : '#C7D2FE',
                              opacity: disabled ? 0.6 : 1,
                              ...(Platform.OS === 'web' ? { cursor: disabled ? 'not-allowed' : 'pointer' } : {}),
                            };
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#3730A3' }}>Avbryt</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => saveGroupChanges(gid)}
                          disabled={!groupHasPending || savingGroupId === gid}
                          style={({ hovered, pressed }) => {
                            const disabled = !groupHasPending || savingGroupId === gid;
                            const hot = hovered || pressed;
                            const bg = disabled ? '#94A3B8' : (hot ? COLORS.blueHover : COLORS.blue);
                            return {
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 10,
                              backgroundColor: bg,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              opacity: disabled ? 0.6 : 1,
                              ...(Platform.OS === 'web' ? { cursor: disabled ? 'not-allowed' : 'pointer' } : {}),
                            };
                          }}
                        >
                          <Ionicons name={savingGroupId === gid ? 'time-outline' : 'save-outline'} size={14} color="#fff" />
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{savingGroupId === gid ? 'Sparar…' : 'Spara'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  <View style={{ paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', gap: 10 }}>
                    <Text style={{ flex: 0.9, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Roll</Text>
                    <Text style={{ flex: 1.25, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Namn</Text>
                    <Text style={{ flex: 1.1, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Företag</Text>
                    <Text style={{ flex: 1.25, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>E-post</Text>
                    <Text style={{ flex: 0.95, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Telefon</Text>
                    <Text style={{ width: 40, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText, textAlign: 'right' }}>Ta bort</Text>
                  </View>

                  {displayMembers.length === 0 ? (
                    <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: COLORS.tableBorder }}>
                      <Text style={{ color: COLORS.textSubtle, fontSize: 13 }}>Inga deltagare i gruppen.</Text>
                    </View>
                  ) : (
                    displayMembers.map((m) => {
                      const mid = String(m?.id || '');
                      const isCompanyGroup = isLockedGroup;
                      const currentRole = String(m?.role || '').trim();
                      const baseRole = String((!m?._pendingAdded ? (baseMembers.find((x) => String(x?.id || '') === mid)?.role) : '') || '').trim();
                      const isEditingRole =
                        !!roleEditTarget &&
                        String(roleEditTarget?.groupId || '') === String(gid) &&
                        String(roleEditTarget?.memberId || '') === String(mid);
                      const roleIsPreset = isPresetCompanyRole(currentRole);
                      const roleDirty = !!m?._pendingRole;
                      return (
                        <View key={mid} style={{ paddingVertical: 5, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: COLORS.tableBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          {isCompanyGroup ? (
                            isEditingRole ? (
                              <TextInput
                                value={roleEditText}
                                onChangeText={setRoleEditText}
                                placeholder="Roll"
                                placeholderTextColor="#94A3B8"
                                autoFocus={Platform.OS === 'web'}
                                onBlur={() => commitRoleEdit({ groupId: gid, memberId: mid, prevRole: currentRole, baseRole: baseRole })}
                                onSubmitEditing={() => commitRoleEdit({ groupId: gid, memberId: mid, prevRole: currentRole, baseRole: baseRole })}
                                style={{
                                  flex: 0.9,
                                  flexBasis: 0,
                                  flexShrink: 1,
                                  minWidth: 0,
                                  borderWidth: 1,
                                  borderColor: roleDirty ? '#F59E0B' : COLORS.inputBorder,
                                  borderRadius: 8,
                                  paddingVertical: 4,
                                  paddingHorizontal: 6,
                                  fontSize: 12,
                                  color: COLORS.text,
                                  backgroundColor: roleDirty ? '#FFFBEB' : '#fff',
                                  ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                                }}
                              />
                            ) : (
                              <Pressable
                                onPress={(e) => {
                                  // If role is custom text, clicking goes straight to edit.
                                  if (currentRole && !roleIsPreset) {
                                    beginRoleEdit({ groupId: gid, memberId: mid, currentRole });
                                    return;
                                  }
                                  openRolePicker(e, { groupId: gid, memberId: mid, displayRole: currentRole, baseRole });
                                }}
                                title={Platform.OS === 'web' ? 'Välj roll' : undefined}
                                style={({ hovered, pressed }) => {
                                  const hot = !!(hovered || pressed);
                                  return {
                                    flex: 0.9,
                                    flexBasis: 0,
                                    flexShrink: 1,
                                    minWidth: 0,
                                    borderWidth: 1,
                                    borderColor: roleDirty ? '#F59E0B' : (hot ? COLORS.blue : COLORS.inputBorder),
                                    borderRadius: 8,
                                    paddingVertical: 4,
                                    paddingHorizontal: 6,
                                    backgroundColor: roleDirty ? '#FFFBEB' : '#fff',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 6,
                                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                                  };
                                }}
                              >
                                <Text
                                  style={{ fontSize: 12, color: currentRole ? COLORS.text : '#94A3B8' }}
                                  numberOfLines={1}
                                >
                                  {currentRole || 'Välj roll'}
                                </Text>
                                <Ionicons name={currentRole && !roleIsPreset ? 'create-outline' : 'chevron-down'} size={14} color={COLORS.neutral} />
                              </Pressable>
                            )
                          ) : (
                            <TextInput
                              defaultValue={String(currentRole || '')}
                              placeholder="Roll"
                              placeholderTextColor="#94A3B8"
                              onBlur={(e) => {
                                const nextRole = String(e?.nativeEvent?.text ?? currentRole ?? '').trim();
                                stageRoleChange(gid, mid, nextRole, baseRole);
                              }}
                              style={{
                                flex: 0.9,
                                flexBasis: 0,
                                flexShrink: 1,
                                minWidth: 0,
                                borderWidth: 1,
                                borderColor: roleDirty ? '#F59E0B' : COLORS.inputBorder,
                                borderRadius: 8,
                                paddingVertical: 4,
                                paddingHorizontal: 6,
                                fontSize: 12,
                                color: COLORS.text,
                                backgroundColor: roleDirty ? '#FFFBEB' : '#fff',
                                ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                              }}
                            />
                          )}
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
                              onPress={() => stageRemoveMember(gid, mid)}
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

      {Platform.OS === 'web' ? (
        <ContextMenu
          visible={roleMenuVisible}
          x={roleMenuPos.x}
          y={roleMenuPos.y}
          items={roleMenuItems}
          onClose={closeRoleMenu}
          onSelect={(it) => {
            const t = roleMenuTarget;
            const gid = String(t?.groupId || '').trim();
            const mid = String(t?.memberId || '').trim();
            const displayRole = String(t?.displayRole || '').trim();
            const baseRole = String(t?.baseRole || '').trim();
            if (!gid || !mid || !it) return;

            if (String(it.key || '') === 'custom') {
              closeRoleMenu();
              beginRoleEdit({ groupId: gid, memberId: mid, currentRole: displayRole });
              return;
            }

            const key = String(it.key || '');
            if (key.startsWith('preset:')) {
              const label = key.slice('preset:'.length);
              stageRoleChange(gid, mid, String(label || '').trim(), baseRole);
              closeRoleMenu();
              return;
            }
          }}
        />
      ) : null}

      <AddParticipantModal
        visible={!!activeModalGroupId}
        onClose={() => setActiveModalGroupId(null)}
        companyId={companyId}
        existingMemberKeys={activeExistingMemberKeys}
        defaultShowInternal
        defaultShowExternal={!activeIsLockedGroup}
        allowInternal
        allowExternal
        lazyLoadExternal={activeIsLockedGroup}
        onAdd={async (candidates) => {
          const list = Array.isArray(candidates) ? candidates : [];
          if (!activeModalGroupId) throw new Error('Saknar grupp.');
          if (list.length === 0) return;
          stageAddCandidates(activeModalGroupId, list);
        }}
      />
    </ScrollView>
  );
}
