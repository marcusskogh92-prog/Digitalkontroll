import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import ConfirmModal from '../../../components/common/Modals/ConfirmModal';
import ContextMenu from '../../../components/ContextMenu';
import CreateInkopsplanModal from './components/CreateInkopsplanModal';
import InkopsplanTable from './components/InkopsplanTable';
import InquiryDraftModal from './components/InquiryDraftModal';
import { useProjectOrganisation } from '../../../hooks/useProjectOrganisation';
import { generateInquiryDraft } from '../../../components/firebase';
import { deleteInkopsplanRow, listenInkopsplanDoc, listenInkopsplanRows, removeInkopsplanRowSupplier, updateInkopsplanRowFields } from './inkopsplanService';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

export default function InkopsplanView({ companyId, projectId }) {
  const [planDoc, setPlanDoc] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [selectedSupplierKey, setSelectedSupplierKey] = useState(null);
  const [deleteRowBusy, setDeleteRowBusy] = useState(false);
  const [deleteSupplierBusy, setDeleteSupplierBusy] = useState(false);
  const [inkopMenu, setInkopMenu] = useState(null);
  const [levMenu, setLevMenu] = useState(null);
  const [openAddSupplierForRowId, setOpenAddSupplierForRowId] = useState(null);
  const [inquiryModalRowId, setInquiryModalRowId] = useState(null);
  const [generatingInquiryDraft, setGeneratingInquiryDraft] = useState(false);
  const [deleteRowConfirm, setDeleteRowConfirm] = useState({ visible: false, row: null });
  const [deleteRowBusyConfirm, setDeleteRowBusyConfirm] = useState(false);
  const upperScrollRef = useRef(null);
  const inkopsplanTableRef = useRef(null);

  useEffect(() => {
    const cid = safeText(companyId);
    const pid = safeText(projectId);
    if (!cid || !pid) return () => {};

    setLoading(true);
    setError('');

    const unsubDoc = listenInkopsplanDoc(
      cid,
      pid,
      (d) => setPlanDoc(d),
      (e) => setError(String(e?.message || e || 'Kunde inte läsa inköpsplan.')),
    );

    const unsubRows = listenInkopsplanRows(
      cid,
      pid,
      (items) => {
        setRows(Array.isArray(items) ? items : []);
        setLoading(false);
      },
      (e) => {
        setError(String(e?.message || e || 'Kunde inte läsa inköpsplanrader.'));
        setLoading(false);
      },
    );

    return () => {
      try { unsubDoc?.(); } catch (_e) {}
      try { unsubRows?.(); } catch (_e) {}
    };
  }, [companyId, projectId, refreshNonce]);

  const triggerRefresh = () => setRefreshNonce((n) => n + 1);

  const inquiryModalRow = useMemo(
    () => (inquiryModalRowId ? (rows.find((r) => r?.id === inquiryModalRowId) || null) : null),
    [rows, inquiryModalRowId],
  );

  const handleSaveInquiryDraft = useCallback(
    async (editedText) => {
      if (!companyId || !projectId || !inquiryModalRowId) return;
      const text = typeof editedText === 'string' ? editedText : '';
      await updateInkopsplanRowFields(companyId, projectId, inquiryModalRowId, { inquiryDraftText: text || null });
      triggerRefresh();
    },
    [companyId, projectId, inquiryModalRowId],
  );

  const handleGenerateInquiryDraft = useCallback(async () => {
    if (!companyId || !projectId || !inquiryModalRow?.id || generatingInquiryDraft) return;
    setGeneratingInquiryDraft(true);
    try {
      const { text } = await generateInquiryDraft(companyId, projectId, { rowName: safeText(inquiryModalRow?.name) });
      if (text) {
        await updateInkopsplanRowFields(companyId, projectId, inquiryModalRow.id, { inquiryDraftText: text });
        triggerRefresh();
      }
    } catch (e) {
      Alert.alert('Kunde inte generera utkast', e?.message || 'Okänt fel');
    } finally {
      setGeneratingInquiryDraft(false);
    }
  }, [companyId, projectId, inquiryModalRow?.id, inquiryModalRow?.name, generatingInquiryDraft]);

  const openInquiryModalForRow = useCallback((row) => {
    if (row?.id) setInquiryModalRowId(row.id);
  }, []);

  const { organisation } = useProjectOrganisation({ companyId, projectId });
  const projectMembers = useMemo(() => {
    const groups = Array.isArray(organisation?.groups) ? organisation.groups : [];
    const seen = new Set();
    const list = [];
    groups.forEach((g) => {
      (Array.isArray(g?.members) ? g.members : []).forEach((m) => {
        const id = String(m?.id ?? '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        list.push({ id, name: String(m?.name ?? '').trim() || '—' });
      });
    });
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sv'));
  }, [organisation?.groups]);

  const planExists = Boolean(planDoc) || (Array.isArray(rows) && rows.length > 0);

  const selectedRowId = selectedRow?.id ?? null;

  useEffect(() => {
    setSelectedSupplierKey(null);
  }, [selectedRowId]);

  const toggleRowExpanded = useCallback((row) => {
    const id = row?.id ?? null;
    setExpandedRowId((prev) => (prev === id ? null : id));
    if (id) setSelectedRow(rows.find((r) => String(r?.id) === String(id)) || row);
  }, [rows]);

  const existingRowKeySet = useMemo(() => {
    const set = {};
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      const type = safeText(r?.type);
      const sourceId = safeText(r?.sourceId);
      if (!type || !sourceId) return;
      set[`${type}:${sourceId}`] = true;
    });
    return set;
  }, [rows]);

  const topActionLabel = planExists ? 'Lägg till från register' : 'Skapa inköpsplan';

  const addNewManualRow = useCallback(() => {
    try {
      inkopsplanTableRef.current?.addNewManualRow?.();
    } catch (_e) {}
  }, []);

  const saveManualRow = useCallback(() => {
    try {
      inkopsplanTableRef.current?.saveManualRow?.();
    } catch (_e) {}
  }, []);

  const handleDeleteRow = useCallback(() => {
    const rowId = selectedRow?.id;
    if (!companyId || !projectId || !rowId) return;
    Alert.alert(
      'Radera inköpsrad',
      'Är du säker på att du vill radera denna rad? Leverantörer kopplade till raden påverkas inte.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Radera',
          style: 'destructive',
          onPress: async () => {
            setDeleteRowBusy(true);
            try {
              await deleteInkopsplanRow({ companyId, projectId, rowId });
              setSelectedRow(null);
              triggerRefresh();
            } catch (e) {
              Alert.alert('Kunde inte radera', e?.message || 'Okänt fel');
            } finally {
              setDeleteRowBusy(false);
            }
          },
        },
      ],
    );
  }, [companyId, projectId, selectedRow?.id]);

  const handleDeleteSupplier = useCallback(() => {
    if (!companyId || !projectId || !selectedRow?.id || !selectedSupplierKey) return;
    Alert.alert(
      'Radera leverantör',
      'Är du säker på att du vill ta bort denna leverantör från raden?',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Radera',
          style: 'destructive',
          onPress: async () => {
            setDeleteSupplierBusy(true);
            try {
              await removeInkopsplanRowSupplier({
                companyId,
                projectId,
                rowId: selectedRow.id,
                supplierKey: selectedSupplierKey,
              });
              setSelectedSupplierKey(null);
              triggerRefresh();
            } catch (e) {
              Alert.alert('Kunde inte radera', e?.message || 'Okänt fel');
            } finally {
              setDeleteSupplierBusy(false);
            }
          },
        },
      ],
    );
  }, [companyId, projectId, selectedRow?.id, selectedSupplierKey]);

  const handleInkopRowContextMenu = useCallback((row, e) => {
    if (Platform.OS !== 'web' || !e?.nativeEvent) return;
    try { e.preventDefault(); } catch (_) {}
    setSelectedRow(row);
    const ev = e.nativeEvent;
    setInkopMenu({ row, x: ev.clientX ?? ev.pageX ?? 0, y: ev.clientY ?? ev.pageY ?? 0 });
  }, []);

  const handleLevRowContextMenu = useCallback((supplierKey, e) => {
    if (Platform.OS !== 'web' || !e?.nativeEvent) return;
    try { e.preventDefault(); } catch (_) {}
    setSelectedSupplierKey(supplierKey);
    const ev = e.nativeEvent;
    setLevMenu({ supplierKey, x: ev.clientX ?? ev.pageX ?? 0, y: ev.clientY ?? ev.pageY ?? 0 });
  }, []);

  const handleRequestAddSupplier = useCallback((row) => {
    if (row?.id) {
      setExpandedRowId(row.id);
      setOpenAddSupplierForRowId(row.id);
    }
  }, []);

  const handleAddSupplierClosed = useCallback(() => {
    setOpenAddSupplierForRowId(null);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Inköpsplan</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            En strukturerad inköpsplan som genereras från företagets register.
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : (
        <View style={styles.singlePanel}>
          {/* Ämnesrad – ljusgrå för att skilja från vit tabell */}
          <View style={styles.upperPanelToolbar}>
            <View style={styles.upperPanelToolbarLeft}>
              <Text style={styles.upperPanelToolbarTitle}>Inköp</Text>
              <View style={styles.upperPanelToolbarDivider} />
            </View>
            <View style={styles.upperPanelToolbarActions}>
              <Pressable
                onPress={saveManualRow}
                style={({ hovered, pressed }) => [
                  styles.toolbarActionBtn,
                  styles.toolbarIconOnlyBtn,
                  (hovered || pressed) && styles.toolbarActionBtnHover,
                ]}
                accessibilityLabel="Spara"
                {...(isWeb() ? { title: 'Spara' } : {})}
              >
                <Ionicons name="save-outline" size={18} color="#334155" />
              </Pressable>
              <Pressable
                onPress={() => setIsModalOpen(true)}
                disabled={!companyId || !projectId}
                style={({ hovered, pressed }) => [
                  styles.toolbarActionBtn,
                  styles.toolbarActionBtnSmall,
                  (hovered || pressed) && styles.toolbarActionBtnHover,
                  (!companyId || !projectId) && { opacity: 0.5 },
                ]}
                accessibilityLabel="Lägg till flera rader från register"
                {...(isWeb() ? { title: 'Lägg till flera rader från företagets register (byggdelar, konton, kategorier)' } : {})}
              >
                <Ionicons name="list" size={14} color="#334155" style={{ marginRight: 5 }} />
                <Text style={styles.toolbarActionBtnTextSmall}>Från register</Text>
              </Pressable>
              <Pressable
                onPress={addNewManualRow}
                style={({ hovered, pressed }) => [
                  styles.toolbarActionBtn,
                  styles.toolbarActionBtnSmall,
                  (hovered || pressed) && styles.toolbarActionBtnHover,
                ]}
                accessibilityLabel="Lägg till en rad"
                {...(isWeb() ? { title: 'Lägg till en ny rad' } : {})}
              >
                <Ionicons name="add" size={14} color="#334155" style={{ marginRight: 5 }} />
                <Text style={styles.toolbarActionBtnTextSmall}>Lägg till rad</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const rowToOpen = selectedRow?.id ? selectedRow : (rows?.length > 0 ? rows[0] : null);
                  if (rowToOpen?.id) {
                    if (!selectedRow?.id) setSelectedRow(rowToOpen);
                    setInquiryModalRowId(rowToOpen.id);
                  } else {
                    Alert.alert('Ingen rad', 'Lägg till först en rad i inköpsplanen.');
                  }
                }}
                style={({ hovered, pressed }) => [
                  styles.toolbarGenerellBtn,
                  styles.toolbarGenerellBtnSmall,
                  (hovered || pressed) && styles.toolbarGenerellBtnHover,
                ]}
                accessibilityLabel="Generell förfrågan"
              >
                <Ionicons name="sparkles" size={14} color="#fff" style={{ marginRight: 5 }} />
                <Text style={styles.toolbarGenerellBtnTextSmall}>Generell förfrågan</Text>
              </Pressable>
              <Pressable
                onPress={() => inkopsplanTableRef.current?.openColumnPicker?.()}
                style={({ hovered, pressed }) => [
                  styles.toolbarActionBtn,
                  styles.toolbarIconOnlyBtn,
                  (hovered || pressed) && styles.toolbarActionBtnHover,
                ]}
                accessibilityLabel="Välj kolumner"
                {...(isWeb() ? { title: 'Välj vilka kolumner som ska visas' } : {})}
              >
                <Ionicons name="filter-outline" size={18} color="#334155" />
              </Pressable>
            </View>
          </View>
          {isWeb() ? (
            <View ref={upperScrollRef} style={[styles.scroll, styles.scrollOverflowAuto]}>
              <View style={styles.scrollContent}>
                {error ? (
                  <View style={{ padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10 }}>
                    <Text style={{ color: '#b91c1c', fontSize: 12, fontWeight: '700' }}>Inköpsplan kunde inte laddas</Text>
                    <Text style={{ color: '#7f1d1d', fontSize: 12, marginTop: 4 }}>{error}</Text>
                  </View>
                ) : null}
                <InkopsplanTable
                  ref={inkopsplanTableRef}
                  companyId={companyId}
                  projectId={projectId}
                  rows={rows}
                  projectMembers={projectMembers}
                  onRowsChanged={triggerRefresh}
                  selectedRowId={selectedRowId}
                  onSelectRow={setSelectedRow}
                  expandedRowId={expandedRowId}
                  onToggleRowExpand={toggleRowExpanded}
                  selectedSupplierKey={selectedSupplierKey}
                  onSelectSupplier={setSelectedSupplierKey}
                  onSupplierContextMenu={handleLevRowContextMenu}
                  onRowContextMenu={handleInkopRowContextMenu}
                  onOpenInquiryModal={openInquiryModalForRow}
                  openAddSupplierForRowId={openAddSupplierForRowId}
                  onRequestAddSupplier={handleRequestAddSupplier}
                  onAddSupplierClosed={handleAddSupplierClosed}
                />
              </View>
            </View>
          ) : (
            <ScrollView ref={upperScrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {error ? (
                <View style={{ padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10 }}>
                  <Text style={{ color: '#b91c1c', fontSize: 12, fontWeight: '700' }}>Inköpsplan kunde inte laddas</Text>
                  <Text style={{ color: '#7f1d1d', fontSize: 12, marginTop: 4 }}>{error}</Text>
                </View>
              ) : null}
              <InkopsplanTable
                ref={inkopsplanTableRef}
                companyId={companyId}
                projectId={projectId}
                rows={rows}
                projectMembers={projectMembers}
                onRowsChanged={triggerRefresh}
                selectedRowId={selectedRowId}
                onSelectRow={setSelectedRow}
                expandedRowId={expandedRowId}
                onToggleRowExpand={toggleRowExpanded}
                selectedSupplierKey={selectedSupplierKey}
                onSelectSupplier={setSelectedSupplierKey}
                onSupplierContextMenu={handleLevRowContextMenu}
                onRowContextMenu={handleInkopRowContextMenu}
                onOpenInquiryModal={openInquiryModalForRow}
                openAddSupplierForRowId={openAddSupplierForRowId}
                onRequestAddSupplier={handleRequestAddSupplier}
                onAddSupplierClosed={handleAddSupplierClosed}
              />
            </ScrollView>
          )}
        </View>
      )}

      <CreateInkopsplanModal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        companyId={companyId}
        projectId={projectId}
        mode={planExists ? 'add' : 'create'}
        existingRowKeySet={existingRowKeySet}
        onCreated={triggerRefresh}
      />

      <InquiryDraftModal
        visible={Boolean(inquiryModalRowId)}
        onClose={() => setInquiryModalRowId(null)}
        draftText={inquiryModalRow?.inquiryDraftText ?? ''}
        rowName={safeText(inquiryModalRow?.name) || undefined}
        onSave={handleSaveInquiryDraft}
        onGenerate={handleGenerateInquiryDraft}
        generating={generatingInquiryDraft}
      />

      {inkopMenu && (
        <ContextMenu
          visible
          x={inkopMenu.x}
          y={inkopMenu.y}
          onClose={() => setInkopMenu(null)}
          items={[
            { key: 'redigera', label: 'Redigera', iconName: 'create-outline' },
            { key: 'radera', label: 'Radera rad', iconName: 'trash-outline', danger: true },
          ]}
          onSelect={(item) => {
            const rowToDelete = inkopMenu?.row;
            setInkopMenu(null);
            if (item?.key === 'radera' && rowToDelete != null) {
              setDeleteRowConfirm({ visible: true, row: rowToDelete });
            }
          }}
          compact
        />
      )}

      <ConfirmModal
        visible={deleteRowConfirm.visible}
        title="Radera inköpsrad"
        message={
          !deleteRowConfirm.row?.id
            ? 'Denna rad har inte sparats än och kan inte raderas. Spara raden först (klicka Spara) om du vill lägga till den, eller avbryt redigeringen.'
            : 'Är du säker på att du vill radera denna rad? Leverantörer kopplade till raden påverkas inte.'
        }
        danger
        confirmLabel="Radera"
        busy={deleteRowBusyConfirm}
        confirmDisabled={!deleteRowConfirm.row?.id}
        hideKeyboardHints
        onConfirm={async () => {
          const r = deleteRowConfirm.row;
          const rid = r?.id;
          if (!rid || !companyId || !projectId) {
            setDeleteRowConfirm({ visible: false, row: null });
            return;
          }
          setDeleteRowBusyConfirm(true);
          try {
            await deleteInkopsplanRow({ companyId, projectId, rowId: rid });
            setSelectedRow(null);
            setDeleteRowConfirm({ visible: false, row: null });
            triggerRefresh();
          } catch (e) {
            Alert.alert('Kunde inte radera', e?.message || 'Okänt fel');
          } finally {
            setDeleteRowBusyConfirm(false);
          }
        }}
        onCancel={() => setDeleteRowConfirm({ visible: false, row: null })}
      />

      {levMenu && (
        <ContextMenu
          visible
          x={levMenu.x}
          y={levMenu.y}
          onClose={() => setLevMenu(null)}
          items={[
            { key: 'radera', label: 'Radera leverantör', iconName: 'trash-outline', danger: true },
          ]}
          onSelect={(item) => {
            const key = levMenu.supplierKey;
            setLevMenu(null);
            if (item?.key === 'radera' && key && selectedRow?.id) {
              setSelectedSupplierKey(key);
              setTimeout(() => {
                Alert.alert(
                  'Radera leverantör',
                  'Är du säker på att du vill ta bort denna leverantör från raden?',
                  [
                    { text: 'Avbryt', style: 'cancel' },
                    {
                      text: 'Radera',
                      style: 'destructive',
                      onPress: async () => {
                        setDeleteSupplierBusy(true);
                        try {
                          await removeInkopsplanRowSupplier({
                            companyId,
                            projectId,
                            rowId: selectedRow.id,
                            supplierKey: key,
                          });
                          setSelectedSupplierKey(null);
                          triggerRefresh();
                        } catch (e) {
                          Alert.alert('Kunde inte radera', e?.message || 'Okänt fel');
                        } finally {
                          setDeleteSupplierBusy(false);
                        }
                      },
                    },
                  ],
                );
              }, 0);
            }
          }}
          compact
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    padding: 14,
    backgroundColor: isWeb() ? 'transparent' : '#fff',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 11,
    color: '#64748B',
    fontWeight: '400',
  },
  loading: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitContainer: {
    minHeight: 200,
  },
  singlePanel: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  upperPanel: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  /** Ämnesrad – lätt grå, skiljer från tabellhuvud (inköpsrad) som är mörkare */
  upperPanelToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  upperPanelToolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  upperPanelToolbarTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  upperPanelToolbarDivider: {
    width: 1,
    alignSelf: 'stretch',
    minHeight: 20,
    backgroundColor: '#CBD5E1',
  },
  upperPanelToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  toolbarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  toolbarActionBtnSmall: {
    height: 28,
    paddingHorizontal: 8,
  },
  toolbarActionBtnHover: {
    backgroundColor: '#E2E8F0',
  },
  toolbarIconOnlyBtn: {
    paddingHorizontal: 10,
    minWidth: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarActionBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
  },
  toolbarActionBtnTextSmall: {
    fontSize: 11,
    fontWeight: '500',
    color: '#334155',
  },
  toolbarGenerellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#16A34A',
    borderWidth: 1,
    borderColor: '#15803D',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  toolbarGenerellBtnSmall: {
    height: 28,
    paddingHorizontal: 8,
  },
  toolbarGenerellBtnHover: {
    backgroundColor: '#15803D',
  },
  toolbarGenerellBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  toolbarGenerellBtnTextSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollOverflowAuto: {
    overflow: 'scroll',
  },
  scrollContent: {
    paddingBottom: 16,
    alignSelf: 'stretch',
    minWidth: 'min-content',
  },
  lowerPanel: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 2,
    borderTopColor: '#94A3B8',
  },
  lowerPanelToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
    gap: 12,
  },
  lowerPanelToolbarTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  lowerPanelToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lowerPanelScroll: {
    flex: 1,
    minHeight: 0,
  },
  lowerPanelScrollContent: {
    paddingBottom: 16,
    alignSelf: 'stretch',
    minWidth: 'min-content',
  },
  lowerPanelPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  lowerPanelPlaceholderText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 360,
  },
});
