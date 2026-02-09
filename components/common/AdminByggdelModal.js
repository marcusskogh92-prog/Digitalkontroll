/**
 * Admin modal: Byggdelstabell. Opens from Register → Byggdelstabell.
 * Smalare modal, samma UX som Kunder/Leverantörer: fast header, toolbar, scroll endast i tabellen.
 * Använder grundregistret foretag/{companyId}/byggdelar (code, name, notes, isDefault).
 * Default-byggdelar får inte raderas, endast kompletteras (redigera namn/anteckningar).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ContextMenu from '../ContextMenu';
import ByggdelTable from './ByggdelTable';
import {
  createByggdel,
  deleteByggdel,
  fetchByggdelar,
  updateByggdel,
} from '../firebase';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  box: {
    width: Platform.OS === 'web' ? '90vw' : '90%',
    maxWidth: 720,
    height: Platform.OS === 'web' ? '85vh' : '85%',
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
    flexDirection: 'column',
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  closeBtn: { padding: 8 },
  statusOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 100,
    zIndex: 100,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  statusBoxSuccess: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  statusBoxError: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  toolbarSection: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toolbarDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginTop: 12,
    marginHorizontal: -20,
  },
  tableScroll: { flex: 1, minHeight: 0, overflow: 'hidden' },
  tableScrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  searchWrap: {
    flex: 1,
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#111', padding: 0, marginLeft: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPrimary: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 15, fontWeight: '500', color: '#475569', marginBottom: 6 },
  selectCompany: { padding: 32, alignItems: 'center' },
  selectCompanyText: { fontSize: 15, fontWeight: '500', color: '#475569' },
  footer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  footerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
});

function normalizeCode(v) {
  return String(v ?? '').replace(/\D/g, '').slice(0, 3);
}

export default function AdminByggdelModal({ visible, companyId, onClose }) {
  const cid = String(companyId || '').trim();
  const hasCompany = Boolean(cid);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [allByggdelar, setAllByggdelar] = useState([]);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('code');
  const [sortDirection, setSortDirection] = useState('asc');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [inlineByggdel, setInlineByggdel] = useState('');
  const [inlineBeskrivning, setInlineBeskrivning] = useState('');
  const [inlineAnteckningar, setInlineAnteckningar] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuItem, setRowMenuItem] = useState(null);

  const statusOpacity = useRef(new Animated.Value(0)).current;
  const statusTimeoutRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Vid tomt companyId använder fetchByggdelar resolveCompanyId som fallback till token (t.ex. MS Byggsystem)
      const list = await fetchByggdelar(cid || null);
      setAllByggdelar(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || 'Kunde inte ladda byggdelstabellen.');
    } finally {
      setLoading(false);
    }
  }, [cid]);

  const showContent = hasCompany || allByggdelar.length > 0;

  useEffect(() => {
    if (!visible) return;
    load();
  }, [visible, load]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [visible]);

  useLayoutEffect(() => {
    if (!notice && !error) return;
    statusOpacity.setValue(1);
  }, [notice, error, statusOpacity]);

  useEffect(() => {
    if (!notice && !error) return;
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    const delay = notice ? 3000 : 4000;
    statusTimeoutRef.current = setTimeout(() => {
      Animated.timing(statusOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setNotice('');
        setError('');
      });
      statusTimeoutRef.current = null;
    }, delay);
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    };
  }, [notice, error, statusOpacity]);

  const showNotice = (msg) => {
    setError('');
    setNotice(msg);
  };

  const formatWriteError = (e) => {
    if (e?.code === 'permission-denied') return 'Saknar behörighet.';
    return e?.message || 'Kunde inte spara.';
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return allByggdelar;
    const s = search.toLowerCase().trim();
    return allByggdelar.filter((m) => {
      const code = String(m.code ?? '').toLowerCase();
      const name = String(m.name ?? '').toLowerCase();
      const notes = String(m.notes ?? '').toLowerCase();
      return code.includes(s) || name.includes(s) || notes.includes(s);
    });
  }, [allByggdelar, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sortColumn === 'code' || sortColumn === 'moment') {
        aVal = String(a.code ?? '').trim();
        bVal = String(b.code ?? '').trim();
      } else if (sortColumn === 'name') {
        aVal = String(a.name ?? '').trim();
        bVal = String(b.name ?? '').trim();
      } else if (sortColumn === 'anteckningar' || sortColumn === 'notes') {
        aVal = String(a.notes ?? '').trim();
        bVal = String(b.notes ?? '').trim();
      }
      const cmp = (aVal || '').localeCompare(bVal || '', 'sv');
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortColumn, sortDirection]);

  /** Tabell förväntar moment/name/anteckningar; API ger code/name/notes */
  const tableItems = useMemo(
    () =>
      sorted.map((i) => ({
        ...i,
        moment: i.code,
        anteckningar: i.notes,
      })),
    [sorted]
  );

  const handleSort = (col) => {
    const internalCol = col === 'moment' ? 'code' : col === 'anteckningar' ? 'notes' : col;
    if (sortColumn === internalCol) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(internalCol);
      setSortDirection('asc');
    }
  };

  const handleInlineSave = async () => {
    if (!cid) return;
    const code = normalizeCode(inlineByggdel);
    const name = String(inlineBeskrivning || '').trim();
    if (!code || !name) return;
    setInlineSaving(true);
    try {
      await createByggdel(
        { code, name, notes: String(inlineAnteckningar || '').trim() },
        cid
      );
      setInlineByggdel('');
      setInlineBeskrivning('');
      setInlineAnteckningar('');
      await load();
      showNotice('Byggdel tillagd');
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setInlineSaving(false);
    }
  };

  const handleSaveEdit = async (byggdelId, values) => {
    if (!cid) return;
    const item = tableItems.find((i) => i.id === byggdelId);
    const patch = {
      name: String(values.beskrivning ?? '').trim(),
      notes: String(values.anteckningar ?? '').trim(),
    };
    if (item && !item.isDefault && values.byggdel) {
      const code = normalizeCode(values.byggdel);
      if (code) patch.code = code;
    }
    setSaving(true);
    setError('');
    try {
      await updateByggdel(cid, byggdelId, patch);
      showNotice('Byggdel uppdaterad');
      setEditingId(null);
      await load();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (item.isDefault) return;
    if (!cid) return;
    const code = String(item.code ?? '').trim();
    const name = String(item.name ?? '').trim();
    const msg = `Vill du verkligen ta bort byggdel ${code}${name ? ` – ${name}` : ''}?`;
    const ok =
      Platform.OS === 'web'
        ? window.confirm(msg)
        : await new Promise((resolve) => {
            Alert.alert('Ta bort byggdel', msg, [
              { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Ta bort', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    try {
      await deleteByggdel(cid, item.id);
      showNotice('Byggdel borttagen');
      if (editingId === item.id) setEditingId(null);
      await load();
    } catch (e) {
      setError(e?.message || 'Kunde inte ta bort.');
    }
  };

  const openRowMenu = (e, item) => {
    const allowDelete = !item.isDefault;
    if (Platform.OS !== 'web') {
      const buttons = [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Redigera', onPress: () => setEditingId(item.id) },
      ];
      if (allowDelete) buttons.push({ text: 'Ta bort', style: 'destructive', onPress: () => handleDelete(item) });
      Alert.alert('Byggdel', `${item.code ?? ''} ${item.name ?? ''}`.trim(), buttons);
      return;
    }
    const ne = e?.nativeEvent || e;
    const x = Number(ne?.pageX ?? 20);
    const y = Number(ne?.pageY ?? 64);
    setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    setRowMenuItem(item);
    setRowMenuVisible(true);
  };

  const rowMenuItems = useMemo(() => {
    const items = [{ key: 'edit', label: 'Redigera', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> }];
    if (rowMenuItem && !rowMenuItem.isDefault) {
      items.push({ key: 'delete', label: 'Ta bort', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#b91c1c" /> });
    }
    return items;
  }, [rowMenuItem]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.box} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name="layers-outline" size={22} color="#1976D2" />
              </View>
              <View>
                <Text style={styles.title}>Byggdelstabell</Text>
                <Text style={styles.subtitle}>Register över byggdelar</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Stäng">
              <Ionicons name="close" size={24} color="#475569" />
            </TouchableOpacity>
          </View>

          <View style={styles.toolbarSection}>
            {!showContent ? (
              <View style={styles.selectCompany}>
                <Text style={styles.selectCompanyText}>
                  {!cid && loading ? 'Laddar för ditt företag…' : 'Välj företag i sidomenyn eller i headern.'}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.toolbar}>
                  <View style={styles.searchWrap}>
                    <Ionicons name="search" size={16} color="#64748b" />
                    <TextInput
                      style={styles.searchInput}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Sök byggdel, beskrivning, anteckningar…"
                      placeholderTextColor="#94a3b8"
                      {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.iconBtn, styles.iconBtnPrimary]}
                      onPress={() => {}}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={load}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="refresh" size={16} color="#475569" />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
            <View style={styles.toolbarDivider} />
          </View>

          <ScrollView
            style={styles.tableScroll}
            contentContainerStyle={styles.tableScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {!showContent ? null : (
              <View>
                {loading ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Laddar byggdelar…</Text>
                  </View>
                ) : (
                  <ByggdelTable
                    items={tableItems}
                    sortColumn={sortColumn === 'code' ? 'moment' : sortColumn === 'notes' ? 'anteckningar' : sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    editingId={editingId}
                    saving={saving}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onRowMenu={openRowMenu}
                    inlineEnabled={showContent}
                    inlineSaving={inlineSaving}
                    inlineValues={{
                      byggdel: inlineByggdel,
                      beskrivning: inlineBeskrivning,
                      anteckningar: inlineAnteckningar,
                    }}
                    onInlineChange={(field, value) => {
                      if (field === 'byggdel') setInlineByggdel(normalizeCode(value));
                      if (field === 'beskrivning') setInlineBeskrivning(value);
                      if (field === 'anteckningar') setInlineAnteckningar(value);
                    }}
                    onInlineSave={handleInlineSave}
                  />
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.footerBtn} onPress={onClose} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#475569' }}>Stäng</Text>
            </TouchableOpacity>
          </View>

          {(notice || error) ? (
            <Animated.View style={[styles.statusOverlay, { opacity: statusOpacity }]} pointerEvents="none">
              <View style={[styles.statusBox, notice ? styles.statusBoxSuccess : styles.statusBoxError]}>
                {notice ? (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#15803d" />
                    <Text style={{ fontSize: 13, color: '#15803d', fontWeight: '500' }}>{notice}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="warning" size={18} color="#dc2626" />
                    <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: '500' }}>{error}</Text>
                  </>
                )}
              </View>
            </Animated.View>
          ) : null}
        </Pressable>
      </Pressable>

      <ContextMenu
        visible={rowMenuVisible}
        x={rowMenuPos.x}
        y={rowMenuPos.y}
        items={rowMenuItems}
        onClose={() => setRowMenuVisible(false)}
        onSelect={(it) => {
          setRowMenuVisible(false);
          const item = rowMenuItem;
          if (!item || !it) return;
          if (it.key === 'edit') setEditingId(item.id);
          else if (it.key === 'delete' && !item.isDefault) handleDelete(item);
        }}
      />
    </Modal>
  );
}
