/**
 * Modal: Mallar. Öppnas från Företagsinställningar → Mallar eller Register → Mallar.
 * Mallar lagras och avropas mot företagets DK Bas (Företagsmallar/{skede}/Översikt/Checklista).
 * Flikar per skede: Kalkylskede, Produktion, Avslutat, Eftermarknad.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ICON_RAIL } from '../../constants/iconRailTheme';
import { MODAL_DESIGN_2026 as D } from '../../constants/modalDesign2026';
import {
  listChecklistMallar,
  uploadChecklistMall,
  renameChecklistMall,
  deleteChecklistMall,
  getDkBasSiteId,
} from '../../lib/mallarDkBasService';
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';
import { fetchCompanyProfile } from '../firebase';
import ContextMenu from '../ContextMenu';
import ModalBase from './ModalBase';

const PHASE_TABS = [
  { key: 'kalkylskede', label: 'Kalkylskede', icon: 'calculator-outline' },
  { key: 'produktion', label: 'Produktion', icon: 'construct-outline' },
  { key: 'avslut', label: 'Avslutat', icon: 'checkmark-done-outline' },
  { key: 'eftermarknad', label: 'Eftermarknad', icon: 'time-outline' },
];

/** Parsar versionsnummer ur filnamn. Stödjer V-1.0, v-1.0, v1.0, 1.0. Returnerar { major, minor } eller null. */
function parseVersionFromFileName(name) {
  if (!name || typeof name !== 'string') return null;
  const m = name.match(/\b[Vv]-?(\d+)\.?(\d*)\b/) || name.match(/\bversion\s*(\d+)\.?(\d*)\b/i);
  if (!m) return null;
  const major = parseInt(m[1], 10);
  const minor = m[2] ? parseInt(m[2], 10) : 0;
  return Number.isFinite(major) ? { major, minor } : null;
}

/** Nästa minor-version (t.ex. V-1.0 → V-1.1). Om inget version i namnet returneras "V-1.0". */
function getNextMinorVersion(currentFileName) {
  const parsed = parseVersionFromFileName(currentFileName || '');
  if (!parsed) return 'V-1.0';
  return `V-${parsed.major}.${parsed.minor + 1}`;
}

/** Basnamn utan versionssuffix och utan filändelse (t.ex. "Mall checklista V-1.0.xlsx" → "Mall checklista"). */
function getBaseNameWithoutVersion(name) {
  if (!name || typeof name !== 'string') return name || '';
  const withoutExt = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  const trimmed = withoutExt
    .replace(/\s*[Vv]-?\d+(?:\.\d+)?\s*$/i, '')
    .replace(/\s*version\s*\d+(?:\.\d+)?\s*$/i, '')
    .trim();
  return trimmed || withoutExt;
}

/** Filändelse från filnamn. */
function getExtension(name) {
  if (!name || !name.includes('.')) return '.xlsx';
  return name.slice(name.lastIndexOf('.'));
}

/** Visningssträng för version i listan (t.ex. "V-1.0" eller "–"). */
function getVersionFromFileName(name) {
  const parsed = parseVersionFromFileName(name);
  return parsed ? `V-${parsed.major}.${parsed.minor}` : '–';
}

/** I arkivlistan visar vi bara filnamn (utan datum/klockslag i namnet); version och datum har egna kolumner. */
function getArchiveDisplayName(name) {
  if (!name || typeof name !== 'string') return name || '';
  return name
    .replace(/\s\d{4}-\d{2}-\d{2}(?=\.\w+$|$)/, '')
    .replace(/\s\(\d{4}-\d{2}-\d{2}[\s\d.:]+\)(?=\.\w+$|$)/, '');
}

const styles = StyleSheet.create({
  tabRow: {
    flexShrink: 0,
    flexDirection: 'row',
    paddingHorizontal: D.contentPadding,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  tabActive: { borderBottomColor: ICON_RAIL.activeLeftIndicatorColor || '#1e293b' },
  tabLabel: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  tabLabelActive: { color: ICON_RAIL.activeLeftIndicatorColor || '#1e293b', fontWeight: '500' },
  toolbarSection: {
    flexShrink: 0,
    paddingHorizontal: D.contentPadding,
    paddingTop: D.sectionGap,
    paddingBottom: 12,
    backgroundColor: '#fff',
  },
  toolbarDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginTop: 12,
    marginHorizontal: -D.contentPadding,
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: {
    paddingHorizontal: D.contentPadding,
    paddingTop: D.sectionGap,
    paddingBottom: D.contentPadding,
  },
  placeholder: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: D.radius,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 200,
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 8,
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  footerBtnStang: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    backgroundColor: '#475569',
    borderWidth: 0,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  explorerTable: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  explorerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  explorerRowLast: { borderBottomWidth: 0 },
  explorerRowHover: { backgroundColor: '#f0f9ff' },
  explorerChevron: { width: 20, alignItems: 'center', justifyContent: 'center' },
  explorerIcon: { width: 24, alignItems: 'center' },
  explorerName: { flex: 1, fontSize: 13, color: '#1e293b', fontWeight: '500' },
  explorerDate: { fontSize: 12, color: '#64748b', marginRight: 8 },
  explorerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dropZone: { minHeight: 24 },
  dropZoneActive: { backgroundColor: '#e0f2fe', borderRadius: 4 },
  replaceOtherOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingOverlayBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  replaceOtherBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    minWidth: 320,
    maxWidth: '90%',
  },
  replaceOtherTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  replaceOtherText: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  replaceOtherRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  replaceOtherBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  replaceOtherBtnText: { fontSize: 13, fontWeight: '500', color: '#fff' },
  renameInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1e293b',
    marginBottom: 16,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  fileLink: { fontSize: 13, color: '#2563eb', textDecorationLine: 'underline' },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  archiveList: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  archiveItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  comingSoon: { padding: 24, alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: D.radius, borderWidth: 1, borderColor: '#e2e8f0' },
});

export default function MallarModal({ visible, companyId, onClose }) {
  const cid = String(companyId || '').trim();
  const hasCompany = Boolean(cid);

  const [companyName, setCompanyName] = useState('');
  const [activeTab, setActiveTab] = useState('kalkylskede');
  const [checklistMallar, setChecklistMallar] = useState({ active: [], archive: [] });
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [uploadingChecklist, setUploadingChecklist] = useState(false);
  const [errorChecklist, setErrorChecklist] = useState('');
  const [hasDkBas, setHasDkBas] = useState(null);
  const [expandedOversikt, setExpandedOversikt] = useState(true);
  const [expandedChecklista, setExpandedChecklista] = useState(true);
  const [expandedArchive, setExpandedArchive] = useState(false);
  const [deletingChecklist, setDeletingChecklist] = useState(false);
  const [dragOverChecklista, setDragOverChecklista] = useState(false);
  const [replaceOrOtherModal, setReplaceOrOtherModal] = useState(null); // { file, targetFileName }
  const [mallMenuVisible, setMallMenuVisible] = useState(false);
  const [mallMenuPos, setMallMenuPos] = useState({ x: 20, y: 64 });
  const [mallMenuItem, setMallMenuItem] = useState(null); // active item for context menu
  const [replaceTargetItem, setReplaceTargetItem] = useState(null); // item to replace when file input returns
  const [renameModal, setRenameModal] = useState(null); // { item } -> show rename dialog
  const [versionEditModal, setVersionEditModal] = useState(null); // { item } -> ändra versionsnummer
  const [hoveredRowId, setHoveredRowId] = useState(null);
  const fileInputRef = useRef(null);

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: 720,
    defaultHeight: 520,
    minWidth: 400,
    minHeight: 300,
  });

  const hasDragPosition = Platform.OS === 'web' && boxStyle && Object.keys(boxStyle).length > 0;
  const defaultBoxStyle = hasDragPosition
    ? {}
    : {
        width: Platform.OS === 'web' ? '90vw' : '90%',
        maxWidth: 720,
        height: Platform.OS === 'web' ? '85vh' : '85%',
      };

  const loadCompanyName = useCallback(async () => {
    if (!cid) return;
    let cancelled = false;
    try {
      const profile = await fetchCompanyProfile(cid);
      if (!cancelled && profile) {
        setCompanyName(String(profile?.companyName ?? profile?.name ?? '').trim() || cid);
      }
    } catch (_e) {
      if (!cancelled) setCompanyName(cid);
    }
    return () => {
      cancelled = true;
    };
  }, [cid]);

  useEffect(() => {
    if (!visible || !cid) return;
    loadCompanyName();
  }, [visible, cid, loadCompanyName]);

  const loadChecklistMallar = useCallback(async () => {
    if (!cid || activeTab !== 'kalkylskede') return;
    setLoadingChecklist(true);
    setErrorChecklist('');
    try {
      const result = await listChecklistMallar(cid, activeTab);
      setChecklistMallar(result);
    } catch (e) {
      setErrorChecklist(e?.message || 'Kunde inte hämta mallar');
      setChecklistMallar({ active: [], archive: [] });
    } finally {
      setLoadingChecklist(false);
    }
  }, [cid, activeTab]);

  useEffect(() => {
    if (!visible || !hasCompany || activeTab !== 'kalkylskede') return;
    let cancelled = false;
    getDkBasSiteId(cid).then((id) => {
      if (!cancelled) setHasDkBas(Boolean(id));
    });
    return () => { cancelled = true; };
  }, [visible, hasCompany, activeTab, cid]);

  useEffect(() => {
    if (!visible || !hasCompany || activeTab !== 'kalkylskede') return;
    loadChecklistMallar();
  }, [visible, hasCompany, activeTab, loadChecklistMallar]);

  const handleAddOrReplaceMall = useCallback(
    async (file) => {
      if (!file || !cid) return;
      const hasActive = checklistMallar.active.length > 0;
      if (hasActive && Platform.OS === 'web') {
        const replace = window.confirm(
          'Det finns redan en aktiv mall. Vill du byta? Den nuvarande mallen flyttas till arkiv (versionshistorik).'
        );
        if (!replace) return;
      }
      setUploadingChecklist(true);
      setErrorChecklist('');
      try {
        await uploadChecklistMall(cid, activeTab, file, { moveCurrentToArchive: hasActive });
        await loadChecklistMallar();
      } catch (e) {
        setErrorChecklist(e?.message || 'Kunde inte ladda upp mall');
      } finally {
        setUploadingChecklist(false);
      }
    },
    [cid, activeTab, checklistMallar.active.length, loadChecklistMallar]
  );

  const onFileInputChange = useCallback(
    (e) => {
      const file = e?.target?.files?.[0];
      if (!file) {
        e.target.value = '';
        return;
      }
      if (replaceTargetItem) {
        const nameToReplace = replaceTargetItem.name;
        setReplaceTargetItem(null);
        const nextVer = getNextMinorVersion(nameToReplace);
        const baseName = getBaseNameWithoutVersion(nameToReplace);
        const ext = getExtension(file.name || nameToReplace);
        const newFileName = `${baseName} ${nextVer}${ext}`;
        const renamedFile = new File([file], newFileName, { type: file.type || 'application/octet-stream' });
        setUploadingChecklist(true);
        setErrorChecklist('');
        uploadChecklistMall(cid, activeTab, renamedFile, { moveCurrentToArchive: true, replaceOnlyItemName: nameToReplace })
          .then(() => loadChecklistMallar())
          .catch((err) => setErrorChecklist(err?.message || 'Kunde inte ladda upp mall'))
          .finally(() => setUploadingChecklist(false));
      } else {
        handleAddOrReplaceMall(file);
      }
      e.target.value = '';
    },
    [cid, activeTab, replaceTargetItem, handleAddOrReplaceMall, loadChecklistMallar]
  );

  const handleDropOnChecklistFolder = useCallback(
    async (file) => {
      if (!file || !cid || uploadingChecklist || loadingChecklist || hasDkBas === false) return;
      const sameName = (checklistMallar.active || []).some(
        (a) => String(a.name || '').toLowerCase() === String(file.name || '').toLowerCase()
      );
      setUploadingChecklist(true);
      setErrorChecklist('');
      try {
        await uploadChecklistMall(cid, activeTab, file, { moveCurrentToArchive: sameName });
        await loadChecklistMallar();
      } catch (e) {
        setErrorChecklist(e?.message || 'Kunde inte ladda upp mall');
      } finally {
        setUploadingChecklist(false);
      }
    },
    [cid, activeTab, checklistMallar.active, loadChecklistMallar, uploadingChecklist, loadingChecklist, hasDkBas]
  );

  const handleReplaceOrOther = useCallback(
    async (choice) => {
      if (!replaceOrOtherModal?.file || !cid) {
        setReplaceOrOtherModal(null);
        return;
      }
      const { file } = replaceOrOtherModal;
      setReplaceOrOtherModal(null);
      if (uploadingChecklist || loadingChecklist || hasDkBas === false) return;
      setUploadingChecklist(true);
      setErrorChecklist('');
      try {
        if (choice === 'replace') {
          const nextVer = getNextMinorVersion(replaceOrOtherModal.targetFileName);
          const baseName = getBaseNameWithoutVersion(replaceOrOtherModal.targetFileName);
          const ext = getExtension(file.name || replaceOrOtherModal.targetFileName);
          const newFileName = `${baseName} ${nextVer}${ext}`;
          const renamedFile = new File([file], newFileName, { type: file.type || 'application/octet-stream' });
          await uploadChecklistMall(cid, activeTab, renamedFile, {
            moveCurrentToArchive: true,
            replaceOnlyItemName: replaceOrOtherModal.targetFileName,
          });
        } else {
          const base = (file.name || '').replace(/\.[^.]+$/, '');
          const ext = file.name?.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
          const date = new Date().toISOString().slice(0, 10);
          const newName = `${base} (kopia ${date})${ext}`;
          const renamedFile = new File([file], newName, { type: file.type });
          await uploadChecklistMall(cid, activeTab, renamedFile, { moveCurrentToArchive: false });
        }
        await loadChecklistMallar();
      } catch (e) {
        setErrorChecklist(e?.message || 'Kunde inte ladda upp mall');
      } finally {
        setUploadingChecklist(false);
      }
    },
    [replaceOrOtherModal, cid, activeTab, loadChecklistMallar, uploadingChecklist, loadingChecklist, hasDkBas]
  );

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

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [visible, onClose]);

  useEffect(() => {
    if (visible) setActiveTab('kalkylskede');
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setMallMenuVisible(false);
      setMallMenuItem(null);
      setReplaceTargetItem(null);
      setRenameModal(null);
      setVersionEditModal(null);
      setExpandedArchive(false);
      setHoveredRowId(null);
    }
  }, [visible]);

  const mallMenuItems = React.useMemo(
    () => [
      { key: 'replace', label: 'Byt mall', icon: <Ionicons name="cloud-upload-outline" size={16} color="#0f172a" /> },
      { key: 'version', label: 'Ändra versionsnummer', icon: <Ionicons name="time-outline" size={16} color="#0f172a" /> },
      { key: 'rename', label: 'Ändra namn', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
      { key: 'delete', label: 'Ta bort', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#C62828" /> },
    ],
    []
  );

  const handleMallMenuSelect = useCallback(
    (it) => {
      setMallMenuVisible(false);
      const item = mallMenuItem;
      if (!item || !it) return;
      if (it.key === 'replace') {
        setReplaceTargetItem(item);
        if (Platform.OS === 'web' && fileInputRef.current) fileInputRef.current.click();
        return;
      }
      if (it.key === 'version') {
        setVersionEditModal({ item });
        return;
      }
      if (it.key === 'rename') {
        setRenameModal({ item });
        return;
      }
      if (it.key === 'delete') {
        const msg = `Vill du ta bort mallen "${item.name}"? Filen tas bort från Checklista.`;
        if (Platform.OS === 'web') {
          if (!window.confirm(msg)) return;
        } else {
          Alert.alert('Ta bort mall', msg, [
            { text: 'Avbryt', style: 'cancel' },
            {
              text: 'Ta bort',
              style: 'destructive',
              onPress: async () => {
                setDeletingChecklist(true);
                try {
                  await deleteChecklistMall(cid, activeTab, item.name);
                  await loadChecklistMallar();
                } catch (e) {
                  setErrorChecklist(e?.message || 'Kunde inte ta bort mall');
                } finally {
                  setDeletingChecklist(false);
                }
              },
            },
          ]);
          return;
        }
        setDeletingChecklist(true);
        (async () => {
          try {
            await deleteChecklistMall(cid, activeTab, item.name);
            await loadChecklistMallar();
          } catch (e) {
            setErrorChecklist(e?.message || 'Kunde inte ta bort mall');
          } finally {
            setDeletingChecklist(false);
          }
        })();
      }
    },
    [mallMenuItem, cid, activeTab, loadChecklistMallar]
  );

  const handleRenameSubmit = useCallback(
    async (newName) => {
      if (!renameModal?.item || !cid) {
        setRenameModal(null);
        return;
      }
      const trimmed = String(newName || '').trim();
      if (!trimmed) return;
      setUploadingChecklist(true);
      setErrorChecklist('');
      try {
        await renameChecklistMall(cid, activeTab, renameModal.item.name, trimmed);
        await loadChecklistMallar();
        setRenameModal(null);
      } catch (e) {
        setErrorChecklist(e?.message || 'Kunde inte byta namn');
      } finally {
        setUploadingChecklist(false);
      }
    },
    [renameModal, cid, activeTab, loadChecklistMallar]
  );

  const handleVersionEditSubmit = useCallback(
    async (versionInput) => {
      if (!versionEditModal?.item || !cid) {
        setVersionEditModal(null);
        return;
      }
      const raw = String(versionInput || '').trim().replace(/^[Vv]-?/i, '');
      if (!raw) return;
      const parts = raw.split('.');
      const major = parts[0] ? parseInt(parts[0], 10) : 1;
      const minor = parts[1] !== undefined ? parseInt(parts[1], 10) : 0;
      if (!Number.isFinite(major) || major < 0 || !Number.isFinite(minor) || minor < 0) return;
      const versionStr = `V-${major}.${minor}`;
      const baseName = getBaseNameWithoutVersion(versionEditModal.item.name);
      const ext = getExtension(versionEditModal.item.name);
      const newFileName = `${baseName} ${versionStr}${ext}`;
      setUploadingChecklist(true);
      setErrorChecklist('');
      try {
        await renameChecklistMall(cid, activeTab, versionEditModal.item.name, newFileName);
        await loadChecklistMallar();
        setVersionEditModal(null);
      } catch (e) {
        setErrorChecklist(e?.message || 'Kunde inte uppdatera versionsnummer');
      } finally {
        setUploadingChecklist(false);
      }
    },
    [versionEditModal, cid, activeTab, loadChecklistMallar]
  );

  if (!visible) return null;

  const activePhaseLabel = PHASE_TABS.find((t) => t.key === activeTab)?.label || activeTab;

  const subtitle = hasCompany
    ? companyName || cid
    : 'Välj företag i sidomenyn eller i headern';

  const footer = (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
      <TouchableOpacity style={styles.footerBtnStang} onPress={onClose} accessibilityLabel="Stäng">
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Stäng</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ModalBase
      visible={visible}
      onClose={onClose}
      title="Mallar"
      subtitle={subtitle}
      headerVariant="neutral"
      titleIcon={
        <Ionicons name="document-text-outline" size={D.headerNeutralIconSize} color={D.headerNeutralTextColor} />
      }
      boxStyle={[defaultBoxStyle, boxStyle]}
      overlayStyle={overlayStyle}
      headerProps={headerProps}
      resizeHandles={resizeHandles}
      footer={footer}
      contentStyle={{ padding: 0, flex: 1, minHeight: 0 }}
    >
      <View style={styles.tabRow}>
        {PHASE_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tab, isActive && styles.tabActive]}
              accessibilityLabel={`${tab.label}, ${isActive ? 'vald' : 'välj'}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={tab.icon}
                size={18}
                color={isActive ? (ICON_RAIL.activeLeftIndicatorColor || '#1e293b') : '#64748b'}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.toolbarSection}>
        {!hasCompany ? (
          <Text style={{ fontSize: 13, color: '#64748b' }}>Välj företag i sidomenyn eller i headern.</Text>
        ) : (
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            Mallar lagras i företagets DK Bas (Företagsmallar). Enkel hantering per skede.
          </Text>
        )}
        <View style={styles.toolbarDivider} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {!hasCompany ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Välj företag för att hantera mallar.</Text>
          </View>
        ) : activeTab === 'kalkylskede' ? (
          <>
            {Platform.OS === 'web' && (
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.json"
                style={{ display: 'none' }}
                onChange={onFileInputChange}
              />
            )}
            {hasDkBas === false ? (
              <View style={{ paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#fef3c7', borderRadius: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#92400e' }}>
                  Koppla DK Bas under Företagsinställningar → SharePoint för att lagra och hantera mallar här.
                </Text>
              </View>
            ) : null}
            <View style={styles.explorerTable}>
              {/* Rad: Översikt (expandera/kollapsa) */}
              <TouchableOpacity
                style={styles.explorerRow}
                onPress={() => setExpandedOversikt((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={styles.explorerChevron}>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color="#64748b"
                    style={{ transform: [{ rotate: expandedOversikt ? '90deg' : '0deg' }] }}
                  />
                </View>
                <View style={styles.explorerIcon}>
                  <Ionicons name={expandedOversikt ? 'folder-open' : 'folder'} size={20} color="#475569" />
                </View>
                <Text style={styles.explorerName}>Översikt</Text>
              </TouchableOpacity>

              {expandedOversikt ? (
                <>
                  {/* Rad: Checklista (expandera/kollapsa) */}
                  <TouchableOpacity
                    style={[styles.explorerRow, { paddingLeft: 12 + 24 }]}
                    onPress={() => setExpandedChecklista((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.explorerChevron}>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#64748b"
                        style={{ transform: [{ rotate: expandedChecklista ? '90deg' : '0deg' }] }}
                      />
                    </View>
                    <View style={styles.explorerIcon}>
                      <Ionicons name={expandedChecklista ? 'folder-open' : 'folder'} size={20} color="#475569" />
                    </View>
                    <Text style={styles.explorerName}>Checklista</Text>
                  </TouchableOpacity>

                  {expandedChecklista ? (
                    <View
                      style={[styles.dropZone, dragOverChecklista && styles.dropZoneActive]}
                      onDragOver={Platform.OS === 'web' ? (e) => { e.preventDefault(); e.stopPropagation(); setDragOverChecklista(true); } : undefined}
                      onDragLeave={Platform.OS === 'web' ? () => setDragOverChecklista(false) : undefined}
                      onDrop={Platform.OS === 'web' ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverChecklista(false);
                        const file = e.dataTransfer?.files?.[0];
                        if (file && !loadingChecklist && !errorChecklist) handleDropOnChecklistFolder(file);
                      } : undefined}
                    >
                      {dragOverChecklista && Platform.OS === 'web' ? (
                        <View style={[styles.explorerRow, { paddingLeft: 12 + 24 + 24 }]}>
                          <View style={{ width: 20 }} />
                          <View style={{ width: 24 }} />
                          <Text style={{ fontSize: 13, color: '#0284c7', fontWeight: '500' }}>Släpp fil här</Text>
                        </View>
                      ) : null}
                      {loadingChecklist ? (
                        <View style={[styles.explorerRow, styles.explorerRowLast, { paddingLeft: 12 + 24 + 24 }]}>
                          <View style={{ width: 20 }} />
                          <View style={{ width: 24 }} />
                          <ActivityIndicator size="small" color="#1e293b" />
                          <Text style={{ fontSize: 13, color: '#64748b' }}>Hämtar mallar…</Text>
                        </View>
                      ) : errorChecklist ? (
                        <View style={[styles.explorerRow, { paddingLeft: 12 + 24 + 24 }]}>
                          <View style={{ width: 20 }} />
                          <View style={{ width: 24 }} />
                          <Text style={{ flex: 1, fontSize: 13, color: '#dc2626' }}>{errorChecklist}</Text>
                          <TouchableOpacity style={styles.btnSecondary} onPress={loadChecklistMallar}>
                            <Ionicons name="refresh" size={16} color="#475569" />
                            <Text style={{ fontSize: 12, color: '#475569' }}>Försök igen</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          {checklistMallar.active.length === 0 ? (
                            <View style={[styles.explorerRow, checklistMallar.archive.length > 0 ? {} : styles.explorerRowLast, { paddingLeft: 12 + 24 + 24 }]}>
                              <View style={{ width: 20 }} />
                              <View style={styles.explorerIcon}>
                                <Ionicons name="document-text-outline" size={20} color="#94a3b8" />
                              </View>
                              <Text style={[styles.explorerName, { color: '#64748b', fontWeight: '400' }]}>Ingen aktiv mall</Text>
                              <TouchableOpacity
                                onPress={() => {
                                  if (uploadingChecklist || loadingChecklist) return;
                                  if (Platform.OS === 'web' && fileInputRef.current) fileInputRef.current.click();
                                  else Alert.alert('Info', 'Ladda upp mall från webbläget.');
                                }}
                                disabled={uploadingChecklist || loadingChecklist}
                                style={Platform.OS === 'web' ? { cursor: uploadingChecklist || loadingChecklist ? 'not-allowed' : 'pointer' } : {}}
                              >
                                {uploadingChecklist ? (
                                  <ActivityIndicator size="small" color="#2563eb" />
                                ) : (
                                  <Text style={[styles.fileLink, { fontSize: 13 }]}>Lägg till mall</Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <>
                              {checklistMallar.active.map((item) => (
                              <View
                                key={item.id}
                                style={[
                                  styles.explorerRow,
                                  { paddingLeft: 12 + 24 + 24 },
                                  Platform.OS === 'web' && hoveredRowId === item.id && styles.explorerRowHover,
                                ]}
                                onMouseEnter={Platform.OS === 'web' ? () => setHoveredRowId(item.id) : undefined}
                                onMouseLeave={Platform.OS === 'web' ? () => setHoveredRowId(null) : undefined}
                                onDragOver={Platform.OS === 'web' ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
                                onDrop={Platform.OS === 'web' ? (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const file = e.dataTransfer?.files?.[0];
                                  if (file) setReplaceOrOtherModal({ file, targetFileName: item.name });
                                } : undefined}
                                onContextMenu={Platform.OS === 'web' ? (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const ne = e?.nativeEvent ?? e;
                                  const x = Number(ne?.pageX ?? 20);
                                  const y = Number(ne?.pageY ?? 64);
                                  setMallMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
                                  setMallMenuItem(item);
                                  setMallMenuVisible(true);
                                } : undefined}
                              >
                                <View style={styles.explorerChevron} />
                                <View style={styles.explorerIcon}>
                                  <Ionicons name="document-text" size={20} color="#475569" />
                                </View>
                                <TouchableOpacity
                                  onPress={() => item.webUrl && (Platform.OS === 'web' ? window.open(item.webUrl, '_blank') : Linking.openURL(item.webUrl))}
                                  style={{ flex: 1, minWidth: 0 }}
                                >
                                  <Text style={styles.fileLink} numberOfLines={1}>{item.name}</Text>
                                </TouchableOpacity>
                                <Text style={[styles.explorerDate, { width: 40, marginRight: 8 }]} numberOfLines={1}>
                                  {getVersionFromFileName(item.name)}
                                </Text>
                                {item.lastModified ? (
                                  <Text style={styles.explorerDate}>
                                    {new Date(item.lastModified).toLocaleDateString('sv-SE')}
                                  </Text>
                                ) : null}
                                <View style={styles.explorerActions}>
                                  <TouchableOpacity
                                    onPress={() => item.webUrl && (Platform.OS === 'web' ? window.open(item.webUrl, '_blank') : Linking.openURL(item.webUrl))}
                                  >
                                    <Text style={[styles.fileLink, { fontSize: 12 }]}>Öppna</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ))}
                            </>
                          )}
                          {checklistMallar.archive.length > 0 ? (
                            <>
                              <TouchableOpacity
                                style={[
                                  styles.explorerRow,
                                  { paddingLeft: 12 + 24 + 24, backgroundColor: '#f8fafc' },
                                  Platform.OS === 'web' && { cursor: 'pointer' },
                                ]}
                                onPress={() => setExpandedArchive((prev) => !prev)}
                                activeOpacity={0.7}
                              >
                                <View style={styles.explorerChevron}>
                                  <Ionicons
                                    name="chevron-forward"
                                    size={18}
                                    color="#64748b"
                                    style={{ transform: [{ rotate: expandedArchive ? '90deg' : '0deg' }] }}
                                  />
                                </View>
                                <View style={{ width: 24 }} />
                                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#64748b' }}>Versionshistorik (arkiv)</Text>
                                <Text style={[styles.explorerDate, { fontWeight: '500' }]}>{checklistMallar.archive.length} filer</Text>
                              </TouchableOpacity>
                              {expandedArchive ? checklistMallar.archive.map((item, idx) => (
                                <View
                                  key={item.id}
                                  style={[
                                    styles.explorerRow,
                                    idx === checklistMallar.archive.length - 1 ? styles.explorerRowLast : {},
                                    { paddingLeft: 12 + 24 + 24 },
                                    Platform.OS === 'web' && hoveredRowId === item.id && styles.explorerRowHover,
                                  ]}
                                  onMouseEnter={Platform.OS === 'web' ? () => setHoveredRowId(item.id) : undefined}
                                  onMouseLeave={Platform.OS === 'web' ? () => setHoveredRowId(null) : undefined}
                                >
                                  <View style={{ width: 20 }} />
                                  <View style={styles.explorerIcon}>
                                    <Ionicons name="document-text-outline" size={20} color="#94a3b8" />
                                  </View>
                                  <TouchableOpacity
                                    onPress={() => item.webUrl && (Platform.OS === 'web' ? window.open(item.webUrl, '_blank') : Linking.openURL(item.webUrl))}
                                    style={{ flex: 1, minWidth: 0 }}
                                  >
                                    <Text style={[styles.explorerName, { fontWeight: '400', color: '#475569' }]} numberOfLines={1}>{getArchiveDisplayName(item.name)}</Text>
                                  </TouchableOpacity>
                                  <Text style={[styles.explorerDate, { width: 40, marginRight: 8 }]} numberOfLines={1}>
                                    {getVersionFromFileName(item.name)}
                                  </Text>
                                  {item.lastModified ? (
                                    <Text style={styles.explorerDate}>{new Date(item.lastModified).toLocaleDateString('sv-SE')}</Text>
                                  ) : null}
                                  <TouchableOpacity
                                    onPress={() => item.webUrl && (Platform.OS === 'web' ? window.open(item.webUrl, '_blank') : Linking.openURL(item.webUrl))}
                                  >
                                    <Text style={[styles.fileLink, { fontSize: 12 }]}>Öppna</Text>
                                  </TouchableOpacity>
                                </View>
                              )) : null}
                            </>
                          ) : null}
                        </>
                      )}
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          </>
        ) : (
          <View style={styles.comingSoon}>
            <Ionicons name="construct-outline" size={40} color="#cbd5e1" style={{ marginBottom: 8 }} />
            <Text style={styles.placeholderTitle}>Mallar för {activePhaseLabel}</Text>
            <Text style={styles.placeholderText}>Kommer snart. Idag hanteras checklista-mallar under Kalkylskede.</Text>
          </View>
        )}
      </ScrollView>

      {(deletingChecklist || uploadingChecklist) ? (
        <View style={styles.replaceOtherOverlay} pointerEvents="auto">
          <View style={styles.loadingOverlayBox}>
            <ActivityIndicator size="large" color="#1e293b" style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#475569' }}>
              {deletingChecklist ? 'Tar bort mall…' : 'Laddar upp mall…'}
            </Text>
          </View>
        </View>
      ) : null}

      {replaceOrOtherModal && Platform.OS === 'web' ? (
        <View style={styles.replaceOtherOverlay} pointerEvents="box-none">
          <View style={styles.replaceOtherBox}>
            <Text style={styles.replaceOtherTitle}>Släppte fil på befintlig fil</Text>
            <Text style={styles.replaceOtherText}>
              Vill du ersätta "{replaceOrOtherModal.targetFileName}" eller ladda upp med ett annat namn?
            </Text>
            <View style={styles.replaceOtherRow}>
              <TouchableOpacity
                style={styles.replaceOtherBtn}
                onPress={() => handleReplaceOrOther('replace')}
              >
                <Text style={styles.replaceOtherBtnText}>Ersätta filen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.replaceOtherBtn}
                onPress={() => handleReplaceOrOther('other')}
              >
                <Text style={styles.replaceOtherBtnText}>Ladda upp med annat namn</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.replaceOtherBtn, { backgroundColor: 'transparent' }]}
                onPress={() => setReplaceOrOtherModal(null)}
              >
                <Text style={[styles.replaceOtherBtnText, { color: '#64748b' }]}>Avbryt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      <ContextMenu
        visible={mallMenuVisible}
        x={mallMenuPos.x}
        y={mallMenuPos.y}
        items={mallMenuItems}
        onClose={() => setMallMenuVisible(false)}
        onSelect={handleMallMenuSelect}
      />

      {renameModal && renameModal.item ? (
        <View style={styles.replaceOtherOverlay} pointerEvents="box-none">
          <RenameMallBox
            currentName={renameModal.item.name}
            onSave={handleRenameSubmit}
            onCancel={() => setRenameModal(null)}
          />
        </View>
      ) : null}

      {versionEditModal && versionEditModal.item ? (
        <View style={styles.replaceOtherOverlay} pointerEvents="box-none">
          <VersionEditBox
            currentFileName={versionEditModal.item.name}
            onSave={handleVersionEditSubmit}
            onCancel={() => setVersionEditModal(null)}
          />
        </View>
      ) : null}
    </ModalBase>
  );
}

function RenameMallBox({ currentName, onSave, onCancel }) {
  const [value, setValue] = useState(currentName || '');
  useEffect(() => {
    setValue(currentName || '');
  }, [currentName]);
  return (
    <View style={styles.replaceOtherBox}>
      <Text style={styles.replaceOtherTitle}>Ändra namn på mall</Text>
      <Text style={[styles.replaceOtherText, { marginBottom: 8 }]}>
        Ange mallnamn (t.ex. med versionsnummer och datum): Mall checklista v1 2026-02-14.xlsx
      </Text>
      <TextInput
        style={styles.renameInput}
        value={value}
        onChangeText={setValue}
        placeholder="Mall checklista v1 2026-02-14.xlsx"
        autoFocus
      />
      <View style={styles.replaceOtherRow}>
        <TouchableOpacity style={styles.replaceOtherBtn} onPress={() => onSave(value)}>
          <Text style={styles.replaceOtherBtnText}>Spara</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.replaceOtherBtn, { backgroundColor: 'transparent' }]} onPress={onCancel}>
          <Text style={[styles.replaceOtherBtnText, { color: '#64748b' }]}>Avbryt</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function VersionEditBox({ currentFileName, onSave, onCancel }) {
  const currentVer = getVersionFromFileName(currentFileName);
  const initial = currentVer === '–' ? '1.0' : currentVer.replace(/^V-?/i, '');
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const v = getVersionFromFileName(currentFileName);
    setValue(v === '–' ? '1.0' : v.replace(/^V-?/i, ''));
  }, [currentFileName]);
  return (
    <View style={styles.replaceOtherBox}>
      <Text style={styles.replaceOtherTitle}>Ändra versionsnummer</Text>
      <Text style={[styles.replaceOtherText, { marginBottom: 8 }]}>
        Ange versionsnummer (t.ex. 1.1 eller 2.0). Vid "Byt mall" höjs minor automatiskt (1.0 → 1.1).
      </Text>
      <TextInput
        style={styles.renameInput}
        value={value}
        onChangeText={setValue}
        placeholder="1.0 eller 2.0"
        autoFocus
      />
      <View style={styles.replaceOtherRow}>
        <TouchableOpacity style={styles.replaceOtherBtn} onPress={() => onSave(value)}>
          <Text style={styles.replaceOtherBtnText}>Spara</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.replaceOtherBtn, { backgroundColor: 'transparent' }]} onPress={onCancel}>
          <Text style={[styles.replaceOtherBtnText, { color: '#64748b' }]}>Avbryt</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
