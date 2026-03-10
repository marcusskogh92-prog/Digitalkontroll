import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ContextMenu from './ContextMenu';
import { formatPersonName } from './formatPersonName';
import { MODAL_DESIGN_2026 } from '../constants/modalDesign2026';
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../constants/tableLayout';

/** Fast bredd för Status-kolumnen längst till höger (kebab borttagen – endast högerklick/dubbelklick som Leverantörer) */
const STATUS_COLUMN_WIDTH = 80;

/** Justerbara kolumner (golden rules) – endast på webb */
const DEFAULT_COLUMN_WIDTHS = { name: 180, email: 220, role: 100 };
const MIN_COLUMN_WIDTH = 72;
const RESIZE_HANDLE_WIDTH = 6;

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

/** Visar förnamn + efternamn när de finns, annars displayName/email. */
const getDisplayNameForUser = (u) => {
  if (!u) return '';
  const first = String(u.firstName ?? '').trim();
  const last = String(u.lastName ?? '').trim();
  if (first || last) return [first, last].filter(Boolean).join(' ').trim();
  return formatPersonName(u.displayName || u.email || '') || '';
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

  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const resizeRef = useRef({ column: null, startX: 0, startWidth: 0 });

  const w = columnWidths;
  const col = (key) => ({ width: w[key], minWidth: w[key], flexShrink: 0 });
  const gapBetweenCols = isWeb ? RESIZE_HANDLE_WIDTH : 0;

  const startResize = useCallback((column, e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    const clientX = e.clientX ?? e.nativeEvent?.pageX ?? 0;
    resizeRef.current = { column, startX: clientX, startWidth: columnWidths[column] };
  }, [columnWidths]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMove = (e) => {
      const { column, startX, startWidth } = resizeRef.current;
      if (column == null) return;
      const clientX = e.clientX ?? 0;
      const delta = clientX - startX;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [column]: newWidth }));
      resizeRef.current = { ...resizeRef.current, startX: clientX, startWidth: newWidth };
    };
    const onUp = () => {
      resizeRef.current = { column: null, startX: 0, startWidth: 0 };
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

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
      const name = normalizeText(getDisplayNameForUser(u));
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
      return String(getDisplayNameForUser(u) || '');
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
        Alert.alert('Användare', String(getDisplayNameForUser(u) || u?.email || 'Användare'), [
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
        <Text style={{ fontSize: 16, fontWeight: '700' }}>Användare</Text>
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
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#666' }}>{companyName}</Text>
                <Ionicons name="chevron-forward" size={14} color="#999" />
              </>
            ) : null}
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="people-outline" size={20} color="#1976D2" />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>Användare</Text>
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
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : '#475569' }}>{f.label}</Text>
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
                fontSize: 12,
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
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 10,
                    backgroundColor: '#1e293b',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.2s' } : {}),
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Lägg till användare</Text>
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
            <Text style={{ color: '#475569', fontSize: 13, fontWeight: '600' }}>Välj ett företag i listan till vänster</Text>
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
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500' }}>
                Visar {Math.min(shownUsers.length, filtered.length)} av {filtered.length}
              </Text>
              {filtered.length > shownUsers.length ? (
                <TouchableOpacity
                  onPress={() => setVisibleLimit((v) => Math.min(filtered.length, (Number(v) || 500) + 500))}
                  style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.2s' } : {}) }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#1976D2', fontWeight: '700', fontSize: 12 }}>Visa fler</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={[styles.tableWrap, { width: '100%' }]}>
              <View style={[styles.headerRow, isWeb && { gap: gapBetweenCols }]}>
                <TouchableOpacity
                  onPress={() => handleSort('displayName')}
                  style={[styles.headerCell, col('name'), Platform.OS === 'web' && { cursor: 'pointer', userSelect: 'none' }]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.headerText} numberOfLines={1}>Namn</Text>
                  {sortColumn === 'displayName' ? (
                    <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#1976D2" />
                  ) : (
                    <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                  )}
                </TouchableOpacity>
                {isWeb && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('name', e)}><View style={styles.resizeHandleLine} /></View>}
                <TouchableOpacity
                  onPress={() => handleSort('email')}
                  style={[styles.headerCell, col('email'), Platform.OS === 'web' && { cursor: 'pointer', userSelect: 'none' }]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.headerText} numberOfLines={1}>E-post</Text>
                  {sortColumn === 'email' ? (
                    <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#1976D2" />
                  ) : (
                    <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                  )}
                </TouchableOpacity>
                {isWeb && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('email', e)}><View style={styles.resizeHandleLine} /></View>}
                <TouchableOpacity
                  onPress={() => handleSort('role')}
                  style={[styles.headerCell, col('role'), Platform.OS === 'web' && { cursor: 'pointer', userSelect: 'none' }]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.headerText} numberOfLines={1}>Roll</Text>
                  {sortColumn === 'role' ? (
                    <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#1976D2" />
                  ) : (
                    <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                  )}
                </TouchableOpacity>
                {isWeb && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('role', e)}><View style={styles.resizeHandleLine} /></View>}
                <TouchableOpacity
                  onPress={() => handleSort('status')}
                  style={[styles.headerCell, styles.statusCell, Platform.OS === 'web' && { cursor: 'pointer', userSelect: 'none' }]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.headerText}>Status</Text>
                  {sortColumn === 'status' ? (
                    <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#1976D2" />
                  ) : (
                    <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                  )}
                </TouchableOpacity>
                <View style={styles.cellSpacer} />
              </View>

            {loading ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '500' }}>Laddar användare…</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E6E8EC' }}>
                <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Ionicons name="people-outline" size={32} color="#1976D2" />
                </View>
                <Text style={{ color: '#475569', fontSize: 14, fontWeight: '600', marginBottom: 6 }}>Inga användare ännu</Text>
                <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>
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
                      style={[
                        styles.bodyRow,
                        isWeb && { gap: gapBetweenCols },
                        { borderBottomWidth: idx < shownUsers.length - 1 ? 1 : 0, backgroundColor: isHovered ? hoverBg : baseBg },
                        Platform.OS === 'web' && { cursor: isBusy ? 'wait' : 'pointer' },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.cellContent, col('name')]}>
                        <Text style={styles.cellText} numberOfLines={1}>
                          {getDisplayNameForUser(u) || '—'}
                        </Text>
                      </View>
                      {isWeb && <View style={styles.resizeHandle} />}
                      <View style={[styles.cellContent, col('email')]}>
                        {u?.email ? (
                          <TouchableOpacity
                            onPress={() => Linking.openURL(`mailto:${String(u.email).trim()}`)}
                            style={Platform.OS === 'web' ? { cursor: 'pointer' } : {}}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.cellLink} numberOfLines={1}>
                              {String(u.email)}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.cellMuted}>—</Text>
                        )}
                      </View>
                      {isWeb && <View style={styles.resizeHandle} />}
                      <View style={[styles.cellContent, col('role'), { flexDirection: 'row', alignItems: 'center' }]}>
                        <View style={{ alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 999, backgroundColor: roleBadge.bg }}>
                          <Text style={{ fontSize: 12, fontWeight: '500', color: roleBadge.color }}>{roleBadge.label}</Text>
                        </View>
                      </View>
                      {isWeb && <View style={styles.resizeHandle} />}
                      <View style={[styles.cellContent, styles.statusCell, isWeb && { backgroundColor: isHovered ? hoverBg : baseBg }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
                          <View style={{ alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 999, backgroundColor: disabled ? '#FEF2F2' : '#F1F5F9' }}>
                            <Text style={{ fontSize: 12, fontWeight: '500', color: disabled ? '#B91C1C' : '#64748b' }}>{disabled ? 'Inaktiv' : 'Aktiv'}</Text>
                          </View>
                          {isBusy ? (
                            <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
                              <ActivityIndicator size="small" color="#1976D2" />
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.cellSpacer} />
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

const styles = StyleSheet.create({
  tableWrap: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: MODAL_DESIGN_2026.tableRadius,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
    paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    minWidth: 0,
    paddingLeft: COLUMN_PADDING_LEFT,
    paddingRight: COLUMN_PADDING_RIGHT,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  statusCell: {
    width: STATUS_COLUMN_WIDTH,
    minWidth: STATUS_COLUMN_WIDTH,
    flexShrink: 0,
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web' ? { position: 'sticky', right: 0, zIndex: 2, backgroundColor: '#f1f5f9' } : {}),
  },
  cellSpacer: {
    flex: 1,
    minWidth: 0,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MODAL_DESIGN_2026.tableRowHeight,
    paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
    paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
    borderBottomColor: '#eef0f3',
    ...(Platform.OS === 'web' ? { transition: 'background-color 0.15s' } : {}),
  },
  cellContent: {
    paddingLeft: COLUMN_PADDING_LEFT,
    paddingRight: COLUMN_PADDING_RIGHT,
    minWidth: 0,
  },
  cellText: {
    fontSize: 13,
    color: '#111',
  },
  cellLink: {
    fontSize: 13,
    color: '#1976D2',
    textDecorationLine: 'underline',
  },
  cellMuted: {
    fontSize: 13,
    color: '#64748b',
  },
  resizeHandle: {
    width: RESIZE_HANDLE_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'col-resize' } : {}),
  },
  resizeHandleLine: {
    position: 'absolute',
    left: Math.floor(RESIZE_HANDLE_WIDTH / 2) - 1,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: '#cbd5e1',
    borderRadius: 1,
  },
});
