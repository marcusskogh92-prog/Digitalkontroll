import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ContextMenu from './ContextMenu';
import { formatPersonName } from './formatPersonName';

const isMemberDisabled = (member) => {
  if (!member) return false;
  return !!(member.disabled === true || String(member.status || '').toLowerCase() === 'disabled');
};

const getRoleLabel = (member) => {
  const role = String(member?.role || '').trim();
  if (role === 'superadmin' || role === 'admin') return 'Admin';
  return 'Användare';
};

const getRoleBadge = (member) => {
  const role = String(member?.role || '').trim();
  if (role === 'superadmin' || role === 'admin') return { label: 'Admin', color: '#fff', bg: '#1e293b' };
  return { label: 'Användare', color: '#334155', bg: '#e2e8f0' };
};

const normalizeText = (value) => String(value || '').toLowerCase();

const ROLE_FILTERS = [
  { key: 'all', label: 'Alla' },
  { key: 'admin', label: 'Admin' },
  { key: 'user', label: 'Användare' },
];

const isAdminRole = (member) => {
  const r = String(member?.role || '').trim();
  return r === 'admin' || r === 'superadmin';
};

export default function UsersTable({
  companyName,
  hasSelectedCompany,
  users,
  loading,
  error,
  search,
  setSearch,
  onRefresh,
  onAdd,
  onEdit,
  onToggleDisabled,
  onDelete,
  canEditUser,
  canDeleteUser,
  showRoleFilter = false,
}) {
  const isWeb = Platform.OS === 'web';
  const [sortColumn, setSortColumn] = useState('displayName');
  const [sortDirection, setSortDirection] = useState('asc');
  const [visibleLimit, setVisibleLimit] = useState(500);
  const [roleFilter, setRoleFilter] = useState('all');

  const [hoveredRowKey, setHoveredRowKey] = useState(null);
  const [toggleBusyKey, setToggleBusyKey] = useState(null);

  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuUser, setRowMenuUser] = useState(null);

  const [lastClickKey, setLastClickKey] = useState(null);
  const [lastClickAt, setLastClickAt] = useState(0);

  const columnWidths = { actions: 48 };

  const roleFiltered = useMemo(() => {
    const arr = Array.isArray(users) ? users : [];
    if (roleFilter === 'all') return arr;
    if (roleFilter === 'admin') return arr.filter(isAdminRole);
    return arr.filter((u) => !isAdminRole(u));
  }, [users, roleFilter]);

  const filtered = useMemo(() => {
    const arr = roleFiltered;
    const q = normalizeText(search).trim();
    if (!q) return arr;
    return arr.filter((u) => {
      const name = normalizeText(formatPersonName(u?.displayName || u?.email || ''));
      const email = normalizeText(u?.email || '');
      return name.includes(q) || email.includes(q);
    });
  }, [roleFiltered, search]);

  const sorted = useMemo(() => {
    const arr = Array.isArray(filtered) ? [...filtered] : [];
    const col = String(sortColumn || 'displayName');
    const dir = sortDirection === 'desc' ? 'desc' : 'asc';

    const getVal = (u) => {
      if (col === 'email') return String(u?.email || '');
      if (col === 'role') return getRoleLabel(u);
      if (col === 'status') return isMemberDisabled(u) ? 'Inaktiv' : 'Aktiv';
      return String(formatPersonName(u?.displayName || u?.email || '') || '');
    };

    arr.sort((a, b) => {
      const av = normalizeText(getVal(a));
      const bv = normalizeText(getVal(b));
      const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
      return dir === 'asc' ? cmp : -cmp;
    });

    return arr;
  }, [filtered, sortColumn, sortDirection]);

  const shownUsers = useMemo(() => sorted.slice(0, Math.max(0, Number(visibleLimit) || 500)), [sorted, visibleLimit]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const openRowMenu = (e, user) => {
    try {
      if (Platform.OS !== 'web') {
        const u = user || null;
        if (!u) return;
        Alert.alert('Användare', String(u?.displayName || u?.email || 'Användare'), [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Redigera', onPress: () => onEdit?.(u), disabled: !canEditUser?.(u) },
          { text: isMemberDisabled(u) ? 'Aktivera' : 'Inaktivera', onPress: () => onToggleDisabled?.(u) },
          { text: 'Ta bort', style: 'destructive', onPress: () => onDelete?.(u), disabled: !canDeleteUser?.(u) },
        ]);
        return;
      }

      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

      const ne = e?.nativeEvent || e;
      const x = Number(ne?.pageX ?? ne?.clientX ?? ne?.locationX ?? 20);
      const y = Number(ne?.pageY ?? ne?.clientY ?? ne?.locationY ?? 64);
      setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
      setRowMenuUser(user || null);
      setRowMenuVisible(true);
    } catch (_err) {
      setRowMenuPos({ x: 20, y: 64 });
      setRowMenuUser(user || null);
      setRowMenuVisible(true);
    }
  };

  const getUserKey = (u, fallback) => String(u?.uid || u?.id || u?.email || fallback || '');

  const runToggleDisabled = async (u) => {
    const key = getUserKey(u, 'toggle');
    setToggleBusyKey(key);
    try {
      await Promise.resolve(onToggleDisabled?.(u));
    } finally {
      setToggleBusyKey((prev) => (String(prev) === String(key) ? null : prev));
    }
  };

  const rowMenuItems = useMemo(() => {
    const u = rowMenuUser;
    const disabled = isMemberDisabled(u);
    return [
      { key: 'edit', label: 'Redigera', icon: <Ionicons name="create-outline" size={16} color="#0f172a" />, disabled: u ? !canEditUser?.(u) : true },
      { key: 'toggle', label: disabled ? 'Aktivera' : 'Inaktivera', icon: <Ionicons name={disabled ? 'checkmark-circle-outline' : 'ban-outline'} size={16} color="#0f172a" /> },
      { key: 'delete', label: 'Ta bort användare', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#C62828" />, disabled: u ? !canDeleteUser?.(u) : true },
    ];
  }, [rowMenuUser, canEditUser, canDeleteUser]);

  if (!isWeb) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Användare</Text>
        <Text style={{ marginTop: 8, color: '#555' }}>Användare är just nu optimerat för webbläget.</Text>
      </View>
    );
  }

  return (
    <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' }}>
      <View style={{ padding: 16, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E6E8EC' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {companyName ? (
              <>
                <Text style={{ fontSize: 15, fontWeight: '500', color: '#666' }}>{companyName}</Text>
                <Ionicons name="chevron-forward" size={14} color="#999" />
              </>
            ) : null}
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="people-outline" size={20} color="#1976D2" />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>Användare</Text>
          </View>

          {showRoleFilter ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#E2E8F0', borderRadius: 10, padding: 2 }}>
              {ROLE_FILTERS.map((f) => {
                const active = roleFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setRoleFilter(f.key)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      backgroundColor: active ? '#334155' : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.2s' } : {}),
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : '#475569' }}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          <View style={{ flex: 1, maxWidth: 420, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8 }}>
            <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              value={search}
              onChangeText={(v) => {
                setSearch(v);
                setVisibleLimit(500);
              }}
              placeholder="Sök användare (namn eller e-post)"
              style={{
                flex: 1,
                fontSize: 13,
                color: '#111',
                ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
              }}
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {hasSelectedCompany ? (
              <>
                <TouchableOpacity
                  onPress={onAdd}
                  style={{
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: '#1e293b',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.2s' } : {}),
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Lägg till användare</Text>
                </TouchableOpacity>
              </>
            ) : null}

            <TouchableOpacity
              onPress={onRefresh}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: '#F1F5F9',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                alignItems: 'center',
                justifyContent: 'center',
                ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.2s' } : {}),
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={16} color="#475569" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={{ padding: 16 }}>
        {!hasSelectedCompany ? (
          <View style={{ padding: 32, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E6E8EC' }}>
            <Text style={{ color: '#475569', fontSize: 15, fontWeight: '600' }}>Välj ett företag i listan till vänster</Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA', marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="warning" size={20} color="#DC2626" />
                <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '600' }}>{error}</Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>
                Visar {Math.min(shownUsers.length, filtered.length)} av {filtered.length}
              </Text>
              {filtered.length > shownUsers.length ? (
                <TouchableOpacity
                  onPress={() => setVisibleLimit((v) => Math.min(filtered.length, (Number(v) || 500) + 500))}
                  style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.2s' } : {}) }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#1976D2', fontWeight: '700', fontSize: 13 }}>Visa fler</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff', width: '100%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', width: '100%' }}>
                <TouchableOpacity
                  onPress={() => handleSort('displayName')}
                  style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'opacity 0.2s' } : {}) }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Namn</Text>
                  {sortColumn === 'displayName' ? (
                    <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#1976D2" />
                  ) : (
                    <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSort('email')}
                  style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'opacity 0.2s' } : {}) }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>E-post</Text>
                  {sortColumn === 'email' ? (
                    <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#1976D2" />
                  ) : (
                    <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSort('role')}
                  style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'opacity 0.2s' } : {}) }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Roll</Text>
                  {sortColumn === 'role' ? (
                    <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#1976D2" />
                  ) : (
                    <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSort('status')}
                  style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'opacity 0.2s' } : {}) }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Status</Text>
                  {sortColumn === 'status' ? (
                    <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#1976D2" />
                  ) : (
                    <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                  )}
                </TouchableOpacity>
                <View style={{ width: columnWidths.actions, flexShrink: 0 }} />
              </View>

            {loading ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '500' }}>Laddar användare…</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E6E8EC' }}>
                <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Ionicons name="people-outline" size={32} color="#1976D2" />
                </View>
                <Text style={{ color: '#475569', fontSize: 15, fontWeight: '600', marginBottom: 6 }}>Inga användare ännu</Text>
                <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                  {search ? 'Inga användare matchade din sökning.' : 'Lägg till din första användare för att komma igång.'}
                </Text>
              </View>
            ) : (
              <>
                {shownUsers.map((u, idx) => {
                  const key = getUserKey(u, idx);
                  const disabled = isMemberDisabled(u);
                  const roleBadge = getRoleBadge(u);
                  const isHovered = hoveredRowKey && String(hoveredRowKey) === String(key);
                  const isBusy = toggleBusyKey && String(toggleBusyKey) === String(key);
                  const baseBg = idx % 2 === 0 ? '#fff' : '#F8FAFC';
                  const hoverBg = '#E3F2FD';

                  return (
                    <TouchableOpacity
                      key={key}
                      disabled={!!isBusy}
                      onPress={(e) => {
                        if (isBusy) return;
                        const now = Date.now();
                        const isSame = lastClickKey === key;
                        const isDouble = isSame && now - lastClickAt < 280;
                        setLastClickKey(key);
                        setLastClickAt(now);
                        if (isDouble) {
                          if (canEditUser?.(u)) onEdit?.(u);
                          return;
                        }
                        try { e?.stopPropagation?.(); } catch (_e2) {}
                      }}
                      onContextMenu={Platform.OS === 'web' ? (e) => {
                        if (isBusy) return;
                        openRowMenu(e, u);
                      } : undefined}
                      onLongPress={(e) => openRowMenu(e, u)}
                      onMouseEnter={Platform.OS === 'web' ? () => setHoveredRowKey(key) : undefined}
                      onMouseLeave={Platform.OS === 'web' ? () => setHoveredRowKey((prev) => (String(prev) === String(key) ? null : prev)) : undefined}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderBottomWidth: idx < shownUsers.length - 1 ? 1 : 0,
                        borderBottomColor: '#E2E8F0',
                        backgroundColor: isHovered ? hoverBg : baseBg,
                        width: '100%',
                        ...(Platform.OS === 'web' ? { cursor: isBusy ? 'wait' : 'pointer', transition: 'background-color 0.15s' } : {}),
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }} numberOfLines={1}>
                          {formatPersonName(u?.displayName || u?.email || '') || '—'}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 8 }}>
                        {u?.email ? (
                          <TouchableOpacity
                            onPress={() => Linking.openURL(`mailto:${String(u.email).trim()}`)}
                            style={Platform.OS === 'web' ? { cursor: 'pointer' } : {}}
                            activeOpacity={0.7}
                          >
                            <Text style={{ fontSize: 13, color: '#1976D2', textDecorationLine: 'underline' }} numberOfLines={1}>
                              {String(u.email)}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={{ fontSize: 13, color: '#64748b' }}>—</Text>
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
                        <View style={{ alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: roleBadge.bg }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: roleBadge.color }}>{roleBadge.label}</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 }}>
                        <View style={{ alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 999, backgroundColor: disabled ? '#FEF2F2' : '#F1F5F9' }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: disabled ? '#B91C1C' : '#64748b' }}>{disabled ? 'Inaktiv' : 'Aktiv'}</Text>
                        </View>
                        {isBusy ? (
                          <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator size="small" color="#1976D2" />
                          </View>
                        ) : null}
                      </View>
                      <View style={{ width: columnWidths.actions, flexShrink: 0, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <TouchableOpacity
                          onPress={(e) => openRowMenu(e, u)}
                          disabled={!!isBusy}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            backgroundColor: isHovered ? '#E2E8F0' : 'transparent',
                            borderWidth: 0,
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...(Platform.OS === 'web' ? { cursor: isBusy ? 'wait' : 'pointer', transition: 'background-color 0.15s' } : {}),
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="ellipsis-vertical" size={16} color="#475569" />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
            </View>

          </>
        )}

        <ContextMenu
          visible={rowMenuVisible}
          x={rowMenuPos.x}
          y={rowMenuPos.y}
          items={rowMenuItems}
          onClose={() => setRowMenuVisible(false)}
          onSelect={(it) => {
            setRowMenuVisible(false);
            const u = rowMenuUser;
            if (!u || !it) return;
            if (it.key === 'edit') {
              if (canEditUser?.(u)) onEdit?.(u);
            } else if (it.key === 'toggle') {
              runToggleDisabled(u);
            } else if (it.key === 'delete') {
              if (canDeleteUser?.(u)) onDelete?.(u);
            }
          }}
        />
      </View>
    </View>
  );
}
