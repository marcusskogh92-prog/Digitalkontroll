import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import ContextMenu from '../../../components/ContextMenu';
import CreateInkopsplanModal from './components/CreateInkopsplanModal';
import InkopsplanTable from './components/InkopsplanTable';
import InkopsplanRowExpanded from './components/InkopsplanRowExpanded';
import InquiryDraftModal from './components/InquiryDraftModal';
import ResizableVerticalSplit from './components/ResizableVerticalSplit';
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

function PrimaryButton({ label, onPress, disabled }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.primaryBtn,
        (hovered || pressed) && !disabled && styles.primaryBtnHover,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={styles.primaryBtnText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function InkopsplanView({ companyId, projectId }) {
  const [planDoc, setPlanDoc] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedSupplierKey, setSelectedSupplierKey] = useState(null);
  const [deleteRowBusy, setDeleteRowBusy] = useState(false);
  const [deleteSupplierBusy, setDeleteSupplierBusy] = useState(false);
  const [inkopMenu, setInkopMenu] = useState(null);
  const [levMenu, setLevMenu] = useState(null);
  const [inquiryModalRowId, setInquiryModalRowId] = useState(null);
  const [generatingInquiryDraft, setGeneratingInquiryDraft] = useState(false);
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

  const selectedRowFresh = useMemo(() => {
    if (!selectedRowId || !Array.isArray(rows)) return selectedRow;
    const found = rows.find((r) => String(r?.id ?? '') === String(selectedRowId));
    return found ?? selectedRow;
  }, [rows, selectedRowId, selectedRow]);

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

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Inköpsplan</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            En strukturerad inköpsplan som genereras från företagets register.
          </Text>
        </View>
        <PrimaryButton
          label={topActionLabel}
          onPress={() => setIsModalOpen(true)}
          disabled={!companyId || !projectId}
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : (
        <ResizableVerticalSplit
          initialTopRatio={0.55}
          minTopRatio={0.25}
          minBottomRatio={0.2}
          containerStyle={styles.splitContainer}
          topChild={
            <View style={styles.upperPanel}>
              <View style={styles.upperPanelToolbar}>
                <View style={styles.upperPanelToolbarLeft}>
                  <Text style={styles.upperPanelToolbarTitle}>Inköp</Text>
                  <Pressable
                    onPress={addNewManualRow}
                    style={({ hovered, pressed }) => [
                      styles.toolbarIconBtn,
                      styles.toolbarIconBtnRound,
                      (hovered || pressed) && styles.toolbarIconBtnHover,
                    ]}
                    accessibilityLabel="Lägg till rad"
                  >
                    <Text style={styles.toolbarIconBtnText}>+</Text>
                  </Pressable>
                  <Pressable
                    onPress={saveManualRow}
                    style={({ hovered, pressed }) => [
                      styles.toolbarIconBtn,
                      styles.toolbarIconBtnRound,
                      (hovered || pressed) && styles.toolbarIconBtnHover,
                    ]}
                    accessibilityLabel="Spara"
                  >
                    <Ionicons name="save-outline" size={18} color="#0F172A" />
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
                      (hovered || pressed) && styles.toolbarGenerellBtnHover,
                    ]}
                    accessibilityLabel="Generell förfrågan"
                  >
                    <Ionicons name="sparkles" size={16} color="#166534" style={{ marginRight: 4 }} />
                    <Text style={styles.toolbarGenerellBtnText}>Generell förfrågan</Text>
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
                      onRowContextMenu={handleInkopRowContextMenu}
                      onOpenInquiryModal={openInquiryModalForRow}
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
                    onRowContextMenu={handleInkopRowContextMenu}
                    onOpenInquiryModal={openInquiryModalForRow}
                  />
                </ScrollView>
              )}
            </View>
          }
          bottomChild={
            <View style={styles.lowerPanel}>
              <View style={styles.lowerPanelToolbar}>
                <Text style={styles.lowerPanelToolbarTitle}>Leverantörer</Text>
                <View style={styles.lowerPanelToolbarActions} />
              </View>
              {isWeb() ? (
                <View style={[styles.lowerPanelScroll, styles.scrollOverflowAuto]}>
                  <View style={styles.lowerPanelScrollContent}>
                    <InkopsplanRowExpanded
                      row={selectedRowFresh}
                      companyId={companyId}
                      projectId={projectId}
                      selectedSupplierKey={selectedSupplierKey}
                      onSelectSupplier={setSelectedSupplierKey}
                      onSupplierContextMenu={handleLevRowContextMenu}
                    />
                  </View>
                </View>
              ) : (
                <ScrollView style={styles.lowerPanelScroll} contentContainerStyle={styles.lowerPanelScrollContent}>
                  <InkopsplanRowExpanded
                    row={selectedRowFresh}
                    companyId={companyId}
                    projectId={projectId}
                    selectedSupplierKey={selectedSupplierKey}
                    onSelectSupplier={setSelectedSupplierKey}
                    onSupplierContextMenu={handleLevRowContextMenu}
                  />
                </ScrollView>
              )}
            </View>
          }
        />
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
            const rowIdToDelete = rowToDelete?.id;
            setInkopMenu(null);
            if (item?.key === 'radera' && rowIdToDelete && companyId && projectId) {
              setSelectedRow(rowToDelete);
              const cid = companyId;
              const pid = projectId;
              const rid = rowIdToDelete;
              setTimeout(() => {
                Alert.alert(
                  'Radera inköpsrad',
                  'Är du säker på att du vill radera denna rad?',
                  [
                    { text: 'Avbryt', style: 'cancel' },
                    {
                      text: 'Radera',
                      style: 'destructive',
                      onPress: async () => {
                        setDeleteRowBusy(true);
                        try {
                          await deleteInkopsplanRow({ companyId: cid, projectId: pid, rowId: rid });
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
              }, 0);
            }
          }}
          compact
        />
      )}

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
  primaryBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  primaryBtnHover: {
    transform: [{ translateY: -1 }],
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
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
  upperPanel: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  upperPanelToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  upperPanelToolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upperPanelToolbarTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  toolbarIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  toolbarIconBtnRound: {
    borderRadius: 16,
  },
  toolbarIconBtnHover: {
    backgroundColor: '#E2E8F0',
  },
  toolbarIconBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 20,
  },
  toolbarGenerellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#22C55E',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  toolbarGenerellBtnHover: {
    backgroundColor: '#BBF7D0',
  },
  toolbarGenerellBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
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
