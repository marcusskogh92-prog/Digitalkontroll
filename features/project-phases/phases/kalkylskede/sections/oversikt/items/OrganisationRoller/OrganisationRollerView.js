/**
 * OrganisationRollerView
 * (Översikt 02) – project-specific dynamic organisation groups + members.
 */

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from '../../../../../../../../components/common/layoutConstants';
import AddParticipantModal from '../../../../../../../../components/common/ProjectOrganisation/AddParticipantModal';
import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';
import ContextMenu from '../../../../../../../../components/ContextMenu';
import {
  ensureDefaultProjectOrganisationGroup,
  fetchCompanyCustomers,
  fetchCompanyProfile,
  fetchCompanySuppliers,
} from '../../../../../../../../components/firebase';
import { useProjectOrganisation } from '../../../../../../../../hooks/useProjectOrganisation';

const ROLE_QUICK = [
  'Kalkylansvarig',
  'Projektchef',
  'Platschef',
  'Arbetsledare',
  'Projekteringsledare',
  'Inköp',
  'Konstruktion',
  'Intern',
];

const ROLE_ADVANCED = ['BAS-P', 'BAS-U', 'Ombud', 'Offertintag'];

const ROLE_ALL_PRESETS = [...ROLE_QUICK, ...ROLE_ADVANCED];

function isPresetCompanyRole(role) {
  const r = String(role || '').trim();
  if (!r) return false;
  return ROLE_ALL_PRESETS.includes(r);
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
  const roles = Array.isArray(c?.roles)
    ? c.roles.map((r) => String(r || '').trim()).filter(Boolean)
    : (c?.role ? [String(c.role).trim()].filter(Boolean) : []);
  return {
    id,
    source,
    refId,
    name: String(c?.name || '—').trim(),
    company: String(c?.company || '—').trim(),
    email: String(c?.email || '').trim(),
    phone: String(c?.phone || '').trim(),
    roles,
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

function ensureRolesArray(m) {
  if (Array.isArray(m?.roles)) return m.roles.map((r) => String(r || '').trim()).filter(Boolean);
  if (m?.role != null && m.role !== '') return [String(m.role).trim()];
  return [];
}

function computeDisplayMembers(baseMembers, pending) {
  const removed = pending?.removed && typeof pending.removed === 'object' ? pending.removed : {};
  const rolesByMember = pending?.roles && typeof pending.roles === 'object' ? pending.roles : {};
  const added = pending?.added && typeof pending.added === 'object' ? pending.added : {};

  const list = (Array.isArray(baseMembers) ? baseMembers : [])
    .filter((m) => !removed[String(m?.id || '').trim()])
    .map((m) => {
      const mid = String(m?.id || '').trim();
      const roles = (mid && Array.isArray(rolesByMember[mid]))
        ? rolesByMember[mid].map((r) => String(r || '').trim()).filter(Boolean)
        : ensureRolesArray(m);
      const dirtyRole = !!(mid && mid in rolesByMember);
      return { ...m, roles, _pendingRole: dirtyRole };
    });

  const addedList = Object.values(added).map((pm) => {
    const mid = String(pm?.id || '').trim();
    const roles = (mid && Array.isArray(rolesByMember[mid]))
      ? rolesByMember[mid].map((r) => String(r || '').trim()).filter(Boolean)
      : ensureRolesArray(pm);
    const dirtyRole = !!(mid && mid in rolesByMember);
    return { ...pm, roles, _pendingRole: dirtyRole, _pendingAdded: true };
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
    /** Svag blå bakgrund för gruppkort (ca 6% opacity) */
    groupCardBg: 'rgba(25, 118, 210, 0.06)',
  };

  const { groups, loading, error, addGroup, removeGroup, updateGroupTitle, updateGroup, addMember, removeMember, updateMemberRoles } =
    useProjectOrganisation({ companyId, projectId });

  const [defaultGroupEnsured, setDefaultGroupEnsured] = useState(false);

  const [activeModalGroupId, setActiveModalGroupId] = useState(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => ({}));
  const [expandedInitialized, setExpandedInitialized] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  /** Åtgärdsmeny för grupp (⋮): { x, y, gid } */
  const [groupMenuAnchor, setGroupMenuAnchor] = useState(null);
  /** Modal "Redigera grupp": { gid } – förifylls från gruppens data */
  const [editGroupModal, setEditGroupModal] = useState(null);
  const [editGroupDescription, setEditGroupDescription] = useState('');
  const [editGroupLinkToCompany, setEditGroupLinkToCompany] = useState(false);
  const [editGroupCompanyQuery, setEditGroupCompanyQuery] = useState('');
  const [editGroupCompanyResults, setEditGroupCompanyResults] = useState([]);
  const [editGroupSelectedCompany, setEditGroupSelectedCompany] = useState(null);
  const editGroupCompanyDebounceRef = useRef(null);
  /** Modal "Lägg till grupp": beskrivning + valfritt företag */
  const [addGroupModalOpen, setAddGroupModalOpen] = useState(false);
  const [addGroupDescription, setAddGroupDescription] = useState('');
  const [addGroupLinkToCompany, setAddGroupLinkToCompany] = useState(false);
  const [addGroupCompanyQuery, setAddGroupCompanyQuery] = useState('');
  const [addGroupCompanyResults, setAddGroupCompanyResults] = useState([]);
  const [addGroupSelectedCompany, setAddGroupSelectedCompany] = useState(null); // { id, name, type: 'supplier'|'customer' }
  const addGroupCompanyDebounceRef = useRef(null);

  const [roleMenuVisible, setRoleMenuVisible] = useState(false);
  const [roleMenuPos, setRoleMenuPos] = useState({ x: 20, y: 64 });
  const [roleMenuTarget, setRoleMenuTarget] = useState(null); // { groupId, memberId, currentRoles }
  const [roleMenuAdvancedOpen, setRoleMenuAdvancedOpen] = useState(false);
  const [roleEditTarget, setRoleEditTarget] = useState(null); // { groupId, memberId }
  const [roleEditText, setRoleEditText] = useState('');

  // Pending changes per group (golden rule): do not write to backend until user hits Save.
  // Structure: { [gid]: { added: { [tmpId]: memberObj }, removed: { [memberId]: true }, roles: { [memberIdOrTmpId]: string[] } } }
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

  const groupMenuItems = useMemo(() => {
    const a = groupMenuAnchor;
    if (!a) return [];
    return [
      { key: 'edit', label: 'Redigera', disabled: !!a.isLockedGroup },
      { isSeparator: true, key: 'sep-group' },
      { key: 'delete', label: 'Radera grupp', iconName: 'trash-outline', danger: true, disabled: !!a.isLockedGroup || (Number(a.participantCount) || 0) > 0 },
    ];
  }, [groupMenuAnchor]);

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
    const rolesRaw = (p?.roles && typeof p.roles === 'object') ? p.roles : {};
    const roles = {};
    Object.keys(rolesRaw).forEach((k) => {
      const v = rolesRaw[k];
      roles[k] = Array.isArray(v) ? v.map((r) => String(r || '').trim()).filter(Boolean) : (v ? [String(v).trim()].filter(Boolean) : []);
    });
    return {
      added: (p?.added && typeof p.added === 'object') ? p.added : {},
      removed: (p?.removed && typeof p.removed === 'object') ? p.removed : {},
      roles,
    };
  };

  const setPendingForGroup = (gid, next) => {
    const id = String(gid || '').trim();
    if (!id) return;
    setPendingByGroup((prev) => {
      const p = prev && typeof prev === 'object' ? prev : {};
      const merged = { ...(p || {}) };
      const rolesRaw = (next?.roles && typeof next.roles === 'object') ? next.roles : {};
      const roles = {};
      Object.keys(rolesRaw).forEach((k) => {
        const v = rolesRaw[k];
        roles[k] = Array.isArray(v) ? v.map((r) => String(r || '').trim()).filter(Boolean) : (v != null ? [String(v).trim()].filter(Boolean) : []);
      });
      const normalized = {
        added: (next?.added && typeof next.added === 'object') ? next.added : {},
        removed: (next?.removed && typeof next.removed === 'object') ? next.removed : {},
        roles,
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
        if (Array.isArray(pm.roles) && pm.roles.length > 0) next.roles[pm.id] = [...pm.roles];
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

  const stageRoleAdd = (gid, memberId, role, currentRoles) => {
    const id = String(gid || '').trim();
    const mid = String(memberId || '').trim();
    const r = String(role || '').trim();
    if (!id || !mid || !r) return;
    const list = Array.isArray(currentRoles) ? [...currentRoles] : [];
    if (list.includes(r)) return;
    list.push(r);
    const pending = getPendingForGroup(id);
    const next = {
      added: { ...(pending.added || {}) },
      removed: { ...(pending.removed || {}) },
      roles: { ...(pending.roles || {}) },
    };
    next.roles[mid] = list;
    setPendingForGroup(id, next);
  };

  const stageRoleRemove = (gid, memberId, role, currentRoles) => {
    const id = String(gid || '').trim();
    const mid = String(memberId || '').trim();
    const r = String(role || '').trim();
    if (!id || !mid) return;
    const list = Array.isArray(currentRoles) ? currentRoles.filter((x) => String(x || '').trim() !== r) : [];
    const pending = getPendingForGroup(id);
    const next = {
      added: { ...(pending.added || {}) },
      removed: { ...(pending.removed || {}) },
      roles: { ...(pending.roles || {}) },
    };
    next.roles[mid] = list;
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

      // 2) Add members (with roles if staged)
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
        const roles = Array.isArray(pending.roles?.[pm.id]) ? pending.roles[pm.id] : (Array.isArray(pm.roles) ? pm.roles : []);
        const res = await addMember({ groupId: id, candidate, roles });
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
      for (const [mid, rolesArr] of roleEntries) {
        if (String(mid).startsWith('tmp:')) continue;
        if (pending.removed && pending.removed[mid]) continue;
        const arr = Array.isArray(rolesArr) ? rolesArr : [];
        await updateMemberRoles({ groupId: id, memberId: mid, roles: arr });
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
    setRoleMenuAdvancedOpen(false);
  };

  const beginRoleEdit = ({ groupId, memberId, currentRole }) => {
    setRoleEditTarget({ groupId: String(groupId || ''), memberId: String(memberId || '') });
    setRoleEditText(String(currentRole || '').trim());
  };

  const commitRoleEdit = ({ groupId, memberId, currentRoles }) => {
    const nextRole = String(roleEditText || '').trim();
    if (nextRole) stageRoleAdd(String(groupId || ''), String(memberId || ''), nextRole, currentRoles || []);
    setRoleEditTarget(null);
    setRoleEditText('');
  };

  const openRolePicker = (e, { groupId, memberId, currentRoles }) => {
    const gid = String(groupId || '').trim();
    const mid = String(memberId || '').trim();
    const roles = Array.isArray(currentRoles) ? currentRoles : [];
    if (!gid || !mid) return;

    if (Platform.OS !== 'web') {
      const quickButtons = ROLE_QUICK.map((label) => ({
        text: label,
        onPress: () => stageRoleAdd(gid, mid, label, roles),
      }));
      const advancedButtons = ROLE_ADVANCED.map((label) => ({
        text: label,
        onPress: () => stageRoleAdd(gid, mid, label, roles),
      }));
      Alert.alert(
        'Lägg till roll',
        'Snabbval',
        [
          ...quickButtons.slice(0, 5),
          {
            text: 'Visa fler roller…',
            onPress: () => {
              Alert.alert(
                'Avancerade roller',
                undefined,
                [
                  ...quickButtons.slice(5),
                  ...advancedButtons,
                  { text: 'Valfri roll (egen text)', onPress: () => beginRoleEdit({ groupId: gid, memberId: mid, currentRole: '' }) },
                  { text: 'Avbryt', style: 'cancel' },
                ]
              );
            },
          },
          { text: 'Avbryt', style: 'cancel' },
        ]
      );
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

    setRoleMenuTarget({ groupId: gid, memberId: mid, currentRoles: roles });
    setRoleMenuAdvancedOpen(false);
    setRoleMenuVisible(true);
  };

  const roleMenuItems = useMemo(() => {
    const t = roleMenuTarget;
    const currentRoles = Array.isArray(t?.currentRoles) ? t.currentRoles : [];
    const hasRole = (label) => currentRoles.includes(String(label || '').trim());
    const quickItems = ROLE_QUICK.map((label) => ({
      key: `preset:${label}`,
      label,
      disabled: hasRole(label),
    }));
    const advancedItems = ROLE_ADVANCED.map((label) => ({
      key: `preset:${label}`,
      label,
      disabled: hasRole(label),
    }));
    const snabbval = [
      { key: 'header:quick', isSeparator: true, label: 'Snabbval' },
      ...quickItems,
    ];
    if (!roleMenuAdvancedOpen) {
      return [
        ...snabbval,
        { key: 'expand', label: 'Avancerade roller  ▶', keepOpen: true },
      ];
    }
    return [
      ...snabbval,
      { key: 'header:advanced', isSeparator: true, label: 'Avancerade  ▼' },
      ...advancedItems,
      { key: 'sep-custom', isSeparator: true },
      { key: 'custom', label: 'Valfri roll (egen text)', iconName: 'create-outline' },
    ];
  }, [roleMenuTarget, roleMenuAdvancedOpen]);

  const handleAddGroupCompanySearch = useCallback(
    (query) => {
      if (addGroupCompanyDebounceRef.current) clearTimeout(addGroupCompanyDebounceRef.current);
      const q = String(query ?? '').trim();
      if (q.length < 2) {
        setAddGroupCompanyResults([]);
        return;
      }
      addGroupCompanyDebounceRef.current = setTimeout(async () => {
        try {
          const cid = String(companyId || '').trim() || undefined;
          const [suppliers, customers] = await Promise.all([
            fetchCompanySuppliers(cid),
            fetchCompanyCustomers(cid),
          ]);
          const lower = q.toLowerCase();
          const fromSuppliers = (suppliers || [])
            .filter((s) => String(s?.companyName ?? '').trim().toLowerCase().includes(lower))
            .map((s) => ({
              id: s.id,
              name: String(s.companyName ?? '').trim(),
              type: 'supplier',
            }));
          const fromCustomers = (customers || [])
            .filter((c) => String(c?.name ?? '').trim().toLowerCase().includes(lower))
            .map((c) => ({
              id: c.id,
              name: String(c.name ?? '').trim(),
              type: 'customer',
            }));
          const combined = [...fromSuppliers, ...fromCustomers].slice(0, 15);
          setAddGroupCompanyResults(combined);
        } catch {
          setAddGroupCompanyResults([]);
        }
        addGroupCompanyDebounceRef.current = null;
      }, 300);
    },
    [companyId]
  );

  const handleEditGroupCompanySearch = useCallback(
    (query) => {
      if (editGroupCompanyDebounceRef.current) clearTimeout(editGroupCompanyDebounceRef.current);
      const q = String(query ?? '').trim();
      if (q.length < 2) {
        setEditGroupCompanyResults([]);
        return;
      }
      editGroupCompanyDebounceRef.current = setTimeout(async () => {
        try {
          const cid = String(companyId || '').trim() || undefined;
          const [suppliers, customers] = await Promise.all([
            fetchCompanySuppliers(cid),
            fetchCompanyCustomers(cid),
          ]);
          const lower = q.toLowerCase();
          const fromSuppliers = (suppliers || [])
            .filter((s) => String(s?.companyName ?? '').trim().toLowerCase().includes(lower))
            .map((s) => ({
              id: s.id,
              name: String(s.companyName ?? '').trim(),
              type: 'supplier',
            }));
          const fromCustomers = (customers || [])
            .filter((c) => String(c?.name ?? '').trim().toLowerCase().includes(lower))
            .map((c) => ({
              id: c.id,
              name: String(c.name ?? '').trim(),
              type: 'customer',
            }));
          const combined = [...fromSuppliers, ...fromCustomers].slice(0, 15);
          setEditGroupCompanyResults(combined);
        } catch {
          setEditGroupCompanyResults([]);
        }
        editGroupCompanyDebounceRef.current = null;
      }, 300);
    },
    [companyId]
  );

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
          onPress={() => {
            setAddGroupDescription('');
            setAddGroupLinkToCompany(false);
            setAddGroupCompanyQuery('');
            setAddGroupCompanyResults([]);
            setAddGroupSelectedCompany(null);
            setAddGroupModalOpen(true);
          }}
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

      {(Array.isArray(groups) ? groups : []).length > 0 ? (
        <Text style={{ fontSize: 12, color: COLORS.textSubtle, marginBottom: 10 }}>
          Klicka på ⋮ bredvid gruppnamnet för att redigera eller radera gruppen.
        </Text>
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

        const openGroupMenu = (e) => {
          const payload = { gid, title: group?.title, participantCount, isLockedGroup };
          if (Platform.OS === 'web' && e?.nativeEvent) {
            setGroupMenuAnchor({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, ...payload });
          } else if (Platform.OS !== 'web') {
            const canRename = !isLockedGroup;
            const canDelete = !isLockedGroup && participantCount === 0;
            Alert.alert(
              'Grupp',
              undefined,
              [
                { text: 'Avbryt', style: 'cancel' },
                ...(canRename ? [{ text: 'Redigera', onPress: () => { const desc = group?.description ?? group?.title ?? ''; const hasCompany = !!(group?.linkedSupplierId || group?.linkedCustomerId); const companyName = group?.linkedCompanyName ?? ''; const selected = hasCompany && companyName ? { id: group?.linkedSupplierId || group?.linkedCustomerId, name: companyName, type: group?.linkedSupplierId ? 'supplier' : 'customer' } : null; setEditGroupDescription(String(desc).trim()); setEditGroupLinkToCompany(hasCompany); setEditGroupCompanyQuery(companyName); setEditGroupCompanyResults([]); setEditGroupSelectedCompany(selected); setEditGroupModal({ gid }); } }] : []),
                ...(canDelete ? [{ text: 'Radera grupp', style: 'destructive', onPress: async () => { const ok = await confirmWebOrNative('Ta bort gruppen?'); if (ok) removeGroup(gid); } }] : []),
              ].filter(Boolean)
            );
          } else {
            setGroupMenuAnchor({ x: 20, y: 64, ...payload });
          }
        };

        return (
          <View
            key={gid}
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              borderLeftWidth: 3,
              borderLeftColor: COLORS.blue,
              borderRadius: 10,
              backgroundColor: COLORS.groupCardBg,
              marginBottom: 16,
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
                paddingVertical: 10,
                paddingHorizontal: 14,
                backgroundColor: 'transparent',
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
                  backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.12)' : 'transparent',
                  borderRadius: 8,
                })}
              >
                <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={COLORS.blue} />

                <View style={{ minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 15, color: COLORS.groupTitle, fontWeight: '600', flex: 1, minWidth: 0 }} numberOfLines={1}>
                    {String(group?.title || 'Grupp').trim() || 'Grupp'}
                  </Text>
                  <View style={{ backgroundColor: COLORS.border, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 }}>
                    <Text style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: '600' }}>{participantCount}</Text>
                  </View>
                </View>
              </Pressable>

              {/* Åtgärdsmeny (⋮) – alltid synlig på grupp-raden */}
              <Pressable
                onPress={(e) => {
                  e?.stopPropagation?.();
                  openGroupMenu(e);
                }}
                style={({ hovered, pressed }) => ({
                  padding: 6,
                  borderRadius: 8,
                  backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
                accessibilityLabel="Åtgärder för gruppen"
              >
                <Ionicons name="ellipsis-vertical" size={18} color={COLORS.textSubtle} />
              </Pressable>

              {isOpen ? (
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
              ) : null}
            </View>

            {!isOpen ? null : (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.tableBorder }}>
                <View>
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

                  <View style={{ paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', gap: 10, backgroundColor: COLORS.bgMuted, borderBottomWidth: 1, borderBottomColor: COLORS.tableBorder }}>
                    <Text style={{ flex: 0.9, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Roll</Text>
                    <Text style={{ flex: 1.25, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Namn</Text>
                    <Text style={{ flex: 1.1, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Företag</Text>
                    <Text style={{ flex: 1.25, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>E-post</Text>
                    <Text style={{ flex: 0.95, flexBasis: 0, minWidth: 0, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText }}>Telefon</Text>
                    <Text style={{ width: 40, fontSize: 11, fontWeight: '600', color: COLORS.tableHeaderText, textAlign: 'right' }}>Ta bort</Text>
                  </View>

                  {displayMembers.length === 0 ? (
                    <View style={{ paddingVertical: 12, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: COLORS.tableBorder, backgroundColor: '#fff' }}>
                      <Text style={{ color: COLORS.textSubtle, fontSize: 13 }}>Inga deltagare i gruppen.</Text>
                    </View>
                  ) : (
                    displayMembers.map((m, memberIndex) => {
                      const mid = String(m?.id || '');
                      const currentRoles = Array.isArray(m?.roles) ? m.roles : [];
                      const isEditingRole =
                        !!roleEditTarget &&
                        String(roleEditTarget?.groupId || '') === String(gid) &&
                        String(roleEditTarget?.memberId || '') === String(mid);
                      const roleDirty = !!m?._pendingRole;
                      const rowBg = memberIndex % 2 === 0 ? '#fff' : '#FAFAFA';
                      return (
                        <View key={mid} style={{ paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: COLORS.tableBorder, backgroundColor: rowBg, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ flex: 0.9, flexBasis: 0, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                            <Pressable
                              onPress={(e) => openRolePicker(e, { groupId: gid, memberId: mid, currentRoles })}
                              title={Platform.OS === 'web' ? 'Lägg till roll' : undefined}
                              style={({ hovered, pressed }) => {
                                const hot = hovered || pressed;
                                return {
                                  flexShrink: 0,
                                  padding: 4,
                                  borderRadius: 6,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  ...(hot ? { backgroundColor: 'rgba(25, 118, 210, 0.1)' } : {}),
                                  ...(Platform.OS === 'web' ? {
                                    cursor: 'pointer',
                                    ...(hot ? { boxShadow: '0 0 0 1px rgba(25, 118, 210, 0.25)' } : {}),
                                  } : {}),
                                };
                              }}
                              accessibilityLabel="Lägg till roll"
                            >
                              <Ionicons name="add" size={18} color={COLORS.blue} />
                            </Pressable>
                            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                              {currentRoles.map((roleLabel) => (
                                <View
                                  key={roleLabel}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    backgroundColor: roleDirty ? '#FEF3C7' : '#EFF6FF',
                                    borderWidth: 1,
                                    borderColor: roleDirty ? '#F59E0B' : '#BFDBFE',
                                    borderRadius: 6,
                                    paddingVertical: 2,
                                    paddingLeft: 6,
                                    paddingRight: 2,
                                  }}
                                >
                                  <Text style={{ fontSize: 11, color: COLORS.text, fontWeight: '500' }} numberOfLines={1}>
                                    {roleLabel}
                                  </Text>
                                  <Pressable
                                    onPress={() => stageRoleRemove(gid, mid, roleLabel, currentRoles)}
                                    style={({ hovered, pressed }) => ({
                                      padding: 2,
                                      borderRadius: 4,
                                      backgroundColor: (hovered || pressed) ? 'rgba(0,0,0,0.08)' : 'transparent',
                                    })}
                                    accessibilityLabel={`Ta bort roll ${roleLabel}`}
                                  >
                                    <Ionicons name="close" size={14} color={COLORS.textSubtle} />
                                  </Pressable>
                                </View>
                              ))}
                              {isEditingRole ? (
                                <TextInput
                                  value={roleEditText}
                                  onChangeText={setRoleEditText}
                                  placeholder="Egen roll"
                                  placeholderTextColor="#94A3B8"
                                  autoFocus={Platform.OS === 'web'}
                                  onBlur={() => commitRoleEdit({ groupId: gid, memberId: mid, currentRoles })}
                                  onSubmitEditing={() => commitRoleEdit({ groupId: gid, memberId: mid, currentRoles })}
                                  style={{
                                    minWidth: 80,
                                    borderWidth: 1,
                                    borderColor: COLORS.inputBorder,
                                    borderRadius: 6,
                                    paddingVertical: 4,
                                    paddingHorizontal: 6,
                                    fontSize: 12,
                                    color: COLORS.text,
                                    backgroundColor: '#fff',
                                    ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                                  }}
                                />
                              ) : null}
                            </View>
                          </View>
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
                                backgroundColor: (hovered || pressed) ? 'rgba(220, 38, 38, 0.12)' : 'transparent',
                                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                              })}
                            >
                              {({ hovered, pressed }) => (
                                <Ionicons name="trash-outline" size={16} color={(hovered || pressed) ? COLORS.danger : COLORS.textSubtle} />
                              )}
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

      <Modal visible={!!editGroupModal} transparent animationType="fade" onRequestClose={() => setEditGroupModal(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => {
            setEditGroupModal(null);
            setEditGroupDescription('');
            setEditGroupLinkToCompany(false);
            setEditGroupCompanyQuery('');
            setEditGroupCompanyResults([]);
            setEditGroupSelectedCompany(null);
          }}
        >
          <Pressable style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 20, width: '100%', maxWidth: 400 }} onPress={(e) => e?.stopPropagation?.()}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 12 }}>Redigera grupp</Text>
            <Text style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 8 }}>Beskrivning (obligatoriskt)</Text>
            <TextInput
              value={editGroupDescription}
              onChangeText={setEditGroupDescription}
              placeholder="T.ex. Beställargrupp, Konstruktörer"
              placeholderTextColor="#94A3B8"
              style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: COLORS.text, marginBottom: 12, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }}
            />
            <Pressable
              onPress={() => setEditGroupLinkToCompany((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: editGroupLinkToCompany ? 12 : 16 }}
            >
              <Ionicons
                name={editGroupLinkToCompany ? 'checkbox' : 'square-outline'}
                size={20}
                color={editGroupLinkToCompany ? COLORS.blue : COLORS.textSubtle}
                style={{ marginRight: 8 }}
              />
              <Text style={{ fontSize: 14, color: COLORS.text }}>Koppla grupp till ett företag</Text>
            </Pressable>
            {editGroupLinkToCompany ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 8 }}>Företag (sök leverantörer och kunder, minst 2 tecken)</Text>
                <TextInput
                  value={editGroupCompanyQuery}
                  onChangeText={(text) => {
                    setEditGroupCompanyQuery(text);
                    handleEditGroupCompanySearch(text);
                  }}
                  placeholder="Sök företagsnamn..."
                  placeholderTextColor="#94A3B8"
                  style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: COLORS.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }}
                />
                {editGroupSelectedCompany ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: COLORS.bgMuted, borderRadius: 8 }}>
                    <Text style={{ fontSize: 14, color: COLORS.text, flex: 1 }}>{editGroupSelectedCompany.name}</Text>
                    <Pressable onPress={() => { setEditGroupSelectedCompany(null); setEditGroupCompanyQuery(''); setEditGroupCompanyResults([]); }} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                    </Pressable>
                  </View>
                ) : null}
                {editGroupCompanyResults.length > 0 && !editGroupSelectedCompany ? (
                  <View style={{ marginTop: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, maxHeight: 200 }}>
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                      {editGroupCompanyResults.map((company) => (
                        <Pressable
                          key={`${company.type}-${company.id}`}
                          onPress={() => {
                            setEditGroupSelectedCompany(company);
                            setEditGroupCompanyQuery(company.name);
                            setEditGroupCompanyResults([]);
                          }}
                          style={({ hovered }) => ({ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: hovered ? COLORS.bgMuted : 'transparent' })}
                        >
                          <Text style={{ fontSize: 14, color: COLORS.text }}>{company.name}</Text>
                          <Text style={{ fontSize: 12, color: COLORS.textMuted }}>{company.type === 'supplier' ? 'Leverantör' : 'Kund'}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable
                onPress={() => {
                  setEditGroupModal(null);
                  setEditGroupDescription('');
                  setEditGroupLinkToCompany(false);
                  setEditGroupCompanyQuery('');
                  setEditGroupCompanyResults([]);
                  setEditGroupSelectedCompany(null);
                }}
                style={({ hovered }) => ({ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: hovered ? COLORS.bgMuted : 'transparent' })}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textMuted }}>Avbryt</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const gid = editGroupModal?.gid;
                  const description = String(editGroupDescription || '').trim();
                  if (!gid || !description) return;
                  const linkedSupplierId = editGroupLinkToCompany && editGroupSelectedCompany?.type === 'supplier' ? editGroupSelectedCompany.id : null;
                  const linkedCustomerId = editGroupLinkToCompany && editGroupSelectedCompany?.type === 'customer' ? editGroupSelectedCompany.id : null;
                  const linkedCompanyName = editGroupLinkToCompany && editGroupSelectedCompany ? editGroupSelectedCompany.name : null;
                  updateGroup(gid, {
                    description,
                    linkedSupplierId,
                    linkedCustomerId,
                    linkedCompanyName,
                  });
                  setEditGroupModal(null);
                  setEditGroupDescription('');
                  setEditGroupLinkToCompany(false);
                  setEditGroupCompanyQuery('');
                  setEditGroupCompanyResults([]);
                  setEditGroupSelectedCompany(null);
                }}
                disabled={!String(editGroupDescription || '').trim()}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  backgroundColor: !String(editGroupDescription || '').trim() ? COLORS.border : hovered || pressed ? COLORS.blueHover : COLORS.blue,
                  opacity: !String(editGroupDescription || '').trim() ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Spara</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={addGroupModalOpen} transparent animationType="fade" onRequestClose={() => setAddGroupModalOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={() => {
            setAddGroupModalOpen(false);
            setAddGroupDescription('');
            setAddGroupLinkToCompany(false);
            setAddGroupCompanyQuery('');
            setAddGroupCompanyResults([]);
            setAddGroupSelectedCompany(null);
          }}
        >
          <Pressable style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 20, width: '100%', maxWidth: 400 }} onPress={(e) => e?.stopPropagation?.()}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 12 }}>Ny grupp</Text>
            <Text style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 8 }}>Beskrivning (obligatoriskt)</Text>
            <TextInput
              value={addGroupDescription}
              onChangeText={setAddGroupDescription}
              placeholder="T.ex. Beställargrupp, Konstruktörer"
              placeholderTextColor="#94A3B8"
              style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: COLORS.text, marginBottom: 12, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }}
            />
            <Pressable
              onPress={() => setAddGroupLinkToCompany((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: addGroupLinkToCompany ? 12 : 16 }}
            >
              <Ionicons
                name={addGroupLinkToCompany ? 'checkbox' : 'square-outline'}
                size={20}
                color={addGroupLinkToCompany ? COLORS.blue : COLORS.textSubtle}
                style={{ marginRight: 8 }}
              />
              <Text style={{ fontSize: 14, color: COLORS.text }}>Koppla grupp till ett företag</Text>
            </Pressable>
            {addGroupLinkToCompany ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 8 }}>Företag (sök leverantörer och kunder, minst 2 tecken)</Text>
                <TextInput
                  value={addGroupCompanyQuery}
                  onChangeText={(text) => {
                    setAddGroupCompanyQuery(text);
                    handleAddGroupCompanySearch(text);
                  }}
                  placeholder="Sök företagsnamn..."
                  placeholderTextColor="#94A3B8"
                  style={{ borderWidth: 1, borderColor: COLORS.inputBorder, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: COLORS.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }}
                />
                {addGroupSelectedCompany ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: COLORS.bgMuted, borderRadius: 8 }}>
                    <Text style={{ fontSize: 14, color: COLORS.text, flex: 1 }}>{addGroupSelectedCompany.name}</Text>
                    <Pressable onPress={() => { setAddGroupSelectedCompany(null); setAddGroupCompanyQuery(''); setAddGroupCompanyResults([]); }} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
                    </Pressable>
                  </View>
                ) : null}
                {addGroupCompanyResults.length > 0 && !addGroupSelectedCompany ? (
                  <View style={{ marginTop: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, maxHeight: 200 }}>
                    <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                      {addGroupCompanyResults.map((company) => (
                        <Pressable
                          key={`${company.type}-${company.id}`}
                          onPress={() => {
                            setAddGroupSelectedCompany(company);
                            setAddGroupCompanyQuery(company.name);
                            setAddGroupCompanyResults([]);
                          }}
                          style={({ hovered }) => ({ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: hovered ? COLORS.bgMuted : 'transparent' })}
                        >
                          <Text style={{ fontSize: 14, color: COLORS.text }}>{company.name}</Text>
                          <Text style={{ fontSize: 12, color: COLORS.textMuted }}>{company.type === 'supplier' ? 'Leverantör' : 'Kund'}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable
                onPress={() => {
                  setAddGroupModalOpen(false);
                  setAddGroupDescription('');
                  setAddGroupLinkToCompany(false);
                  setAddGroupCompanyQuery('');
                  setAddGroupCompanyResults([]);
                  setAddGroupSelectedCompany(null);
                }}
                style={({ hovered }) => ({ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: hovered ? COLORS.bgMuted : 'transparent' })}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textMuted }}>Avbryt</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const description = String(addGroupDescription || '').trim();
                  if (!description) return;
                  const linkedSupplierId = addGroupLinkToCompany && addGroupSelectedCompany?.type === 'supplier' ? addGroupSelectedCompany.id : null;
                  const linkedCustomerId = addGroupLinkToCompany && addGroupSelectedCompany?.type === 'customer' ? addGroupSelectedCompany.id : null;
                  const linkedCompanyName = addGroupLinkToCompany && addGroupSelectedCompany ? addGroupSelectedCompany.name : null;
                  addGroup({
                    description,
                    linkedSupplierId: linkedSupplierId || undefined,
                    linkedCustomerId: linkedCustomerId || undefined,
                    linkedCompanyName: linkedCompanyName || undefined,
                  });
                  setAddGroupModalOpen(false);
                  setAddGroupDescription('');
                  setAddGroupLinkToCompany(false);
                  setAddGroupCompanyQuery('');
                  setAddGroupCompanyResults([]);
                  setAddGroupSelectedCompany(null);
                }}
                disabled={!String(addGroupDescription || '').trim()}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  backgroundColor: !String(addGroupDescription || '').trim() ? COLORS.border : hovered || pressed ? COLORS.blueHover : COLORS.blue,
                  opacity: !String(addGroupDescription || '').trim() ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Skapa</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {Platform.OS === 'web' ? (
        <ContextMenu
          visible={!!groupMenuAnchor}
          x={groupMenuAnchor?.x ?? 0}
          y={groupMenuAnchor?.y ?? 0}
          items={groupMenuItems}
          onClose={() => setGroupMenuAnchor(null)}
          onSelect={async (it) => {
            const a = groupMenuAnchor;
            if (!a?.gid || !it) return;
            setGroupMenuAnchor(null);
            if (String(it.key) === 'edit') {
              const group = (groups || []).find((g) => String(g?.id || '') === String(a.gid || ''));
              const desc = group?.description ?? group?.title ?? '';
              const hasCompany = !!(group?.linkedSupplierId || group?.linkedCustomerId);
              const companyName = group?.linkedCompanyName ?? '';
              const selected =
                hasCompany && companyName
                  ? {
                      id: group?.linkedSupplierId || group?.linkedCustomerId,
                      name: companyName,
                      type: group?.linkedSupplierId ? 'supplier' : 'customer',
                    }
                  : null;
              setEditGroupDescription(String(desc).trim());
              setEditGroupLinkToCompany(hasCompany);
              setEditGroupCompanyQuery(companyName);
              setEditGroupCompanyResults([]);
              setEditGroupSelectedCompany(selected);
              setEditGroupModal({ gid: a.gid });
              return;
            }
            if (String(it.key) === 'delete') {
              const count = Number(a.participantCount) || 0;
              const msg = count > 0
                ? `Gruppen innehåller ${count} person(er). Ta bort dem först, eller bekräfta att du vill radera gruppen och alla i den.`
                : 'Ta bort gruppen?';
              const ok = await confirmWebOrNative(msg);
              if (ok) removeGroup(a.gid);
            }
          }}
        />
      ) : null}

      {Platform.OS === 'web' ? (
        <ContextMenu
          visible={roleMenuVisible}
          x={roleMenuPos.x}
          y={roleMenuPos.y}
          items={roleMenuItems}
          compact
          maxWidth={260}
          onClose={closeRoleMenu}
          onSelect={(it) => {
            const t = roleMenuTarget;
            const gid = String(t?.groupId || '').trim();
            const mid = String(t?.memberId || '').trim();
            const currentRoles = Array.isArray(t?.currentRoles) ? t.currentRoles : [];
            if (!gid || !mid || !it) return;
            if (String(it.key || '') === 'expand') {
              setRoleMenuAdvancedOpen(true);
              return;
            }
            if (String(it.key || '').startsWith('header:') || String(it.key || '').startsWith('sep-')) return;

            if (String(it.key || '') === 'custom') {
              closeRoleMenu();
              beginRoleEdit({ groupId: gid, memberId: mid, currentRole: '' });
              return;
            }

            const key = String(it.key || '');
            if (key.startsWith('preset:')) {
              const label = key.slice('preset:'.length).trim();
              if (it.disabled) { closeRoleMenu(); return; }
              stageRoleAdd(gid, mid, label, currentRoles);
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
        groupLinkedSupplierId={activeGroup?.linkedSupplierId ?? undefined}
        groupLinkedCustomerId={activeGroup?.linkedCustomerId ?? undefined}
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
