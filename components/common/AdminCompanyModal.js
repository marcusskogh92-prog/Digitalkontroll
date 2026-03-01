/**
 * Admin modal: Företag (superadmin) – flikbaserat kontrollcenter.
 * Öppnas från rail Superadmin → Företag → klick på ett företag.
 * Flikar: Översikt, Moduler, Licenser, Användare, Sharepoint, Register.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../../constants/modalDesign2026';
import { ICON_RAIL, PROGRESS_THEME } from '../../constants/iconRailTheme';
import { PROJECT_PHASES } from '../../features/projects/constants';
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';
import CompanyAIPromptsContent from '../CompanyAIPromptsContent';
import CompanySharePointContent from '../CompanySharePointContent';
import CompanyUsersContent from '../CompanyUsersContent';
import {
    adminFetchCompanyMembers,
    fetchCompanyMembers,
    fetchCompanyProfile,
    resolveCompanyLogoUrl,
    saveCompanyProfile,
    setCompanyNameRemote,
    setCompanyStatusRemote,
    setCompanyUserLimitRemote,
    uploadCompanyLogo,
} from '../firebase';
import ContextMenu from '../ContextMenu';
import { AdminModalContext } from './AdminModalContext';
import LoadingState from './LoadingState';

const MODULE_PHASES = PROJECT_PHASES.filter((p) => p.key !== 'free');

// Moduler inkl. Planering och AI-analys. Aktiveras per företag i Företagsinställningar → Moduler.
const ALL_MODULES = [
  { key: 'kalkylskede', name: 'Kalkyl', description: 'Kalkylskede, offerter och projekthantering.', icon: 'calculator-outline', comingSoon: false },
  { key: 'produktion', name: 'Produktion', description: 'Produktionsfas och fältarbete.', icon: 'construct-outline', comingSoon: false },
  { key: 'avslut', name: 'Avslutat', description: 'Avslut och slutleverans.', icon: 'checkmark-circle-outline', comingSoon: false },
  { key: 'eftermarknad', name: 'Eftermarknad', description: 'Eftermarknad och underhåll.', icon: 'time-outline', comingSoon: false },
  { key: 'planering', name: 'Planering', description: 'Veckoplanering och kapacitet – Gantt-liknande vy med veckor och dagar.', icon: 'calendar-outline', comingSoon: false },
  { key: 'ai-analys', name: 'AI-analys', description: 'AI-stöd för analys och beslut.', icon: 'sparkles-outline', comingSoon: false },
];

const TABS = [
  { key: 'oversikt', label: 'Översikt', icon: 'grid-outline' },
  { key: 'moduler', label: 'Moduler', icon: 'apps-outline' },
  { key: 'licenser', label: 'Licenser', icon: 'people-outline' },
  { key: 'anvandare', label: 'Användare', icon: 'people-outline' },
  { key: 'sharepoint', label: 'Sharepoint', icon: 'cloud-outline' },
  { key: 'register', label: 'Register', icon: 'folder-open-outline' },
  { key: 'planering', label: 'Planering', icon: 'calendar-outline' },
  { key: 'ai-installningar', label: 'AI-Inställningar', icon: 'sparkles-outline' },
];

const PLANERING_STORAGE_PREFIX = 'dk_planering';

const PLANNING_TYPES = [
  { value: 'entreprenad', label: 'Entreprenad', infoText: 'Planering av personal i projekt.' },
  { value: 'service', label: 'Service', infoText: 'Veckoplanering för personal.' },
];

function makePlaneringTabId() {
  return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const REGISTER_LINKS = [
  { key: 'kontoplan', label: 'Kontoplan', description: 'Kontoplan och konton', icon: 'list-outline', openModal: 'openKontoplanModal', comingSoon: false },
  { key: 'byggdelar', label: 'Byggdelar', description: 'Byggdelstabell och koder', icon: 'layers-outline', openModal: 'openByggdelModal', comingSoon: false },
  { key: 'kategorier', label: 'Kategorier', description: 'Kategorier och taggar', icon: 'pricetag-outline', openModal: 'openKategoriModal', comingSoon: false },
  { key: 'mallar', label: 'Mallar', description: 'Mallar för kontroller', icon: 'document-text-outline', openModal: 'openMallarModal', comingSoon: false },
];

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  box: {
    width: Platform.OS === 'web' ? '90vw' : '90%',
    maxWidth: 1200,
    height: Platform.OS === 'web' ? '85vh' : '85%',
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.22)',
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
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: ICON_RAIL.bg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  titleIcon: {
    width: 28,
    height: 28,
    borderRadius: ICON_RAIL.activeBgRadius,
    backgroundColor: ICON_RAIL.activeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '600', color: ICON_RAIL.iconColorActive },
  titleDot: { fontSize: 11, color: ICON_RAIL.iconColor, marginHorizontal: 5, opacity: 0.8 },
  subtitle: { fontSize: 12, color: ICON_RAIL.iconColor, fontWeight: '400', opacity: 0.95 },
  closeBtn: { padding: 5 },
  statusRow: {
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: ICON_RAIL.activeBgRadius,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusCardLabel: { fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600' },
  statusCardValue: { fontSize: 12, fontWeight: '600', color: '#0f172a' },
  tabRow: {
    flexShrink: 0,
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: ICON_RAIL.activeLeftIndicatorColor },
  tabLabel: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  tabLabelActive: { color: ICON_RAIL.activeLeftIndicatorColor, fontWeight: '600' },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { padding: 20, paddingBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardRowLast: { marginBottom: 0 },
  infoLabel: { fontSize: 13, color: '#64748b' },
  infoValue: { fontSize: 13, color: '#0f172a', fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#fff',
    minWidth: 80,
  },
  inputSingleLine: {
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxHeight: 40 } : {}),
  },
  bytBildBtn: {
    marginTop: 10,
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    backgroundColor: ICON_RAIL.bg,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  bytBildBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  moduleCard: {
    width: Platform.OS === 'web' ? 220 : '100%',
    minWidth: 200,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  moduleCardActive: { borderColor: '#1976D2', backgroundColor: '#f0f7ff' },
  moduleCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  moduleCardName: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginBottom: 4 },
  moduleCardDesc: { fontSize: 12, color: '#64748b', marginBottom: 10 },
  moduleCardBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#fef3c7',
    marginBottom: 8,
  },
  moduleCardBadgeText: { fontSize: 11, color: '#92400e', fontWeight: '500' },
  dataLinkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dataLinkCard: {
    position: 'relative',
    width: Platform.OS === 'web' ? 180 : '100%',
    minWidth: 160,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  dataLinkIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dataLinkLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 2 },
  dataLinkDesc: { fontSize: 12, color: '#64748b' },
  planeringList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  planeringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  planeringRowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  planeringRowType: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  planeringRowLabelHidden: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  planeringRowLast: {
    borderBottomWidth: 0,
  },
  planeringRowHover: {
    backgroundColor: '#f8fafc',
  },
  planeringRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  planeringRowSynlig: {
    fontSize: 12,
    color: '#64748b',
  },
  planeringRowDelete: {
    padding: 4,
  },
  planeringRenameOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  planeringRenameBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: 320,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  planeringAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  planeringAddInput: {
    flex: 1,
    minWidth: 140,
    marginBottom: 0,
  },
  planeringAddCheckboxGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  planeringAddCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planeringAddCheckboxSelected: {},
  planeringAddCheckboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planeringAddCheckboxBoxChecked: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  planeringAddCheckboxLabel: {
    fontSize: 14,
    color: '#0f172a',
  },
  planeringAddInfo: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
  },
  planeringAddBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexShrink: 0,
  },
  licenseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  licenseBox: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  licenseBoxTitle: { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  licenseBoxValue: { fontSize: 24, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  licenseBoxSub: { fontSize: 12, color: '#64748b' },
  licenseBoxWarning: { fontSize: 24, fontWeight: '700', color: PROGRESS_THEME.high },
  progressSection: { marginBottom: 24 },
  progressLabel: { fontSize: 13, color: '#334155', marginBottom: 8, fontWeight: '500' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: PROGRESS_THEME.warningBg,
    borderWidth: 1,
    borderColor: PROGRESS_THEME.warningBorder,
  },
  warningBannerText: { fontSize: 13, color: '#92400e', fontWeight: '500' },
  licenseLimitCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginTop: 8,
  },
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
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  footerBtnPrimary: {
    backgroundColor: ICON_RAIL.bg,
    borderColor: ICON_RAIL.bg,
    marginLeft: 8,
    borderRadius: ICON_RAIL.activeBgRadius,
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: `background-color ${ICON_RAIL.hoverTransitionMs}ms ease, opacity ${ICON_RAIL.hoverTransitionMs}ms ease` } : {}),
  },
  footerBtnDark: {
    backgroundColor: ICON_RAIL.bg,
    borderColor: ICON_RAIL.bg,
    borderRadius: ICON_RAIL.activeBgRadius,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  footerBtnPrimaryDisabled: {
    opacity: 0.5,
    ...(Platform.OS === 'web' ? { cursor: 'not-allowed' } : {}),
  },
  saving: { opacity: 0.7 },
  error: { fontSize: 13, color: '#dc2626', marginTop: 8 },
  logoWrap: {
    minWidth: 220,
    width: '42%',
    maxWidth: 280,
  },
  logoPlaceholder: {
    width: '100%',
    minWidth: 200,
    maxWidth: 280,
    aspectRatio: 1.4,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  saveOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderRadius: 14,
  },
  saveLoadingBox: {
    backgroundColor: '#475569',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 }),
  },
  saveSuccessBox: {
    backgroundColor: '#166534',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 }),
  },
  saveSuccessText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});

export default function AdminCompanyModal({ visible, companyId, initialTab, onClose }) {
  const cid = String(companyId || '').trim();
  const {
    openKontoplanModal,
    openByggdelModal,
    openKategoriModal,
    openMallarModal,
  isSubModalOpen = false,
  } = useContext(AdminModalContext) || {};

  const isSubModalOpenRef = useRef(isSubModalOpen);
  const subModalWasOpenWhenEscPressedRef = useRef(false);
  useEffect(() => {
    isSubModalOpenRef.current = isSubModalOpen;
  }, [isSubModalOpen]);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const initialActiveTab = initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : 'oversikt';
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const userHasChosenTabRef = useRef(false);

  useLayoutEffect(() => {
    if (visible && initialTab && TABS.some((t) => t.key === initialTab)) {
      setActiveTab(initialTab);
    } else if (visible && !initialTab) {
      setActiveTab('oversikt');
    }
  }, [visible, initialTab]);

  useEffect(() => {
    if (!visible) userHasChosenTabRef.current = false;
  }, [visible]);

  // Vid öppning med initialTab (t.ex. SharePoint-kopplingar) visa den fliken tills användaren byter
  const effectiveTab =
    visible && initialTab && TABS.some((t) => t.key === initialTab) && !userHasChosenTabRef.current
      ? initialTab
      : activeTab;
  const [enabledPhases, setEnabledPhases] = useState([]);
  const [companyNameDraft, setCompanyNameDraft] = useState('');
  const [companyEnabled, setCompanyEnabled] = useState(true);
  const [userLimitDraft, setUserLimitDraft] = useState('');
  const [adminLimitDraft, setAdminLimitDraft] = useState('');
  const [workerLimitDraft, setWorkerLimitDraft] = useState('');
  const [memberCount, setMemberCount] = useState(null);
  const [adminCount, setAdminCount] = useState(null);
  const [userCount, setUserCount] = useState(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(null);
  const fileInputRef = useRef(null);
  const [planeringTabs, setPlaneringTabs] = useState([]);
  const [planeringTabsLoaded, setPlaneringTabsLoaded] = useState(false);
  const [newPlaneringTabName, setNewPlaneringTabName] = useState('');
  const [newPlaneringTabType, setNewPlaneringTabType] = useState('entreprenad');
  const [lastSavedPlaneringTabs, setLastSavedPlaneringTabs] = useState(null);
  const [hoveredPlaneringTabId, setHoveredPlaneringTabId] = useState(null);
  const [planeringContextMenu, setPlaneringContextMenu] = useState(null);
  const [planeringRenameTab, setPlaneringRenameTab] = useState(null);
  const [planeringRenameDraft, setPlaneringRenameDraft] = useState('');

  const loadPlaneringTabs = useCallback(async () => {
    if (!cid) return;
    try {
      const raw = await AsyncStorage.getItem(`${PLANERING_STORAGE_PREFIX}_tabs_${cid}`);
      const list = raw ? JSON.parse(raw) : null;
      const arr = (Array.isArray(list) ? list : []).map((t) => ({
        ...t,
        visible: t.visible !== false,
        planningType: t.planningType === 'service' ? 'service' : 'entreprenad',
      }));
      setPlaneringTabs(arr);
      setLastSavedPlaneringTabs(arr);
    } catch (_e) {
      setPlaneringTabs([]);
      setLastSavedPlaneringTabs([]);
    } finally {
      setPlaneringTabsLoaded(true);
    }
  }, [cid]);

  useEffect(() => {
    if (visible && cid && effectiveTab === 'planering') {
      setPlaneringTabsLoaded(false);
      loadPlaneringTabs();
    }
  }, [visible, cid, effectiveTab, loadPlaneringTabs]);

  useEffect(() => {
    if (!visible) {
      setLastSavedPlaneringTabs(null);
      setPlaneringTabs([]);
      setPlaneringTabsLoaded(false);
      setPlaneringContextMenu(null);
      setPlaneringRenameTab(null);
      setPlaneringRenameDraft('');
      setHoveredPlaneringTabId(null);
    }
  }, [visible]);

  const addPlaneringTab = useCallback(() => {
    const name = newPlaneringTabName.trim();
    if (!name || !cid) return;
    const id = makePlaneringTabId();
    const planningType = newPlaneringTabType === 'service' ? 'service' : 'entreprenad';
    setPlaneringTabs((prev) => [...prev, { id, name, planningType, visible: true }]);
    setNewPlaneringTabName('');
    setNewPlaneringTabType('entreprenad');
  }, [cid, newPlaneringTabName, newPlaneringTabType]);

  const togglePlaneringTabVisible = useCallback((tabId) => {
    setPlaneringTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, visible: !t.visible } : t))
    );
  }, []);

  const removePlaneringTab = useCallback((tabId) => {
    setPlaneringTabs((prev) => prev.filter((t) => t.id !== tabId));
  }, []);

  const renamePlaneringTab = useCallback((tabId, newName) => {
    const trimmed = String(newName || '').trim();
    if (!trimmed) return;
    setPlaneringTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, name: trimmed } : t))
    );
    setPlaneringRenameTab(null);
    setPlaneringRenameDraft('');
  }, []);

  const loadProfile = useCallback(async () => {
    if (!cid) {
      setProfile(null);
      setEnabledPhases([]);
      setMemberCount(null);
      setAdminCount(null);
      setUserCount(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const p = await fetchCompanyProfile(cid);
      setProfile(p || null);
      const raw = p?.enabledPhases;
      const phaseKeys = [...MODULE_PHASES.map((m) => m.key), 'ai-analys'];
      if (Array.isArray(raw) && raw.length > 0) {
        setEnabledPhases(raw.filter((k) => phaseKeys.includes(k)));
      } else {
        setEnabledPhases(phaseKeys);
      }
      setCompanyNameDraft((p && (p.companyName || p.name)) || cid || '');
      setCompanyEnabled(typeof p?.enabled === 'boolean' ? p.enabled : true);
      const hasRoleLimits = p && (p.adminLimit != null || p.workerLimit != null);
      if (hasRoleLimits) {
        setAdminLimitDraft(String((p && p.adminLimit != null) ? p.adminLimit : ''));
        setWorkerLimitDraft(String((p && p.workerLimit != null) ? p.workerLimit : ''));
        setUserLimitDraft(String((p.adminLimit || 0) + (p.workerLimit || 0)));
      } else {
        setUserLimitDraft(String((p && p.userLimit != null) ? p.userLimit : '10'));
        setAdminLimitDraft(String((p && p.userLimit != null) ? p.userLimit : ''));
        setWorkerLimitDraft('0');
      }

      let list = [];
      try {
        const mems = await adminFetchCompanyMembers(cid);
        if (mems && Array.isArray(mems.members)) list = mems.members;
        else if (mems && (mems.ok || mems.success) && Array.isArray(mems.members)) list = mems.members;
      } catch (_e) {}
      if (list.length === 0) list = await fetchCompanyMembers(cid).catch(() => []) || [];
      const arr = Array.isArray(list) ? list : [];
      setMemberCount(arr.length);
      const admins = arr.filter((m) => m?.role === 'admin' || m?.role === 'superadmin');
      setAdminCount(admins.length);
      setUserCount(arr.length - admins.length);

      const resolved = await resolveCompanyLogoUrl(cid).catch(() => '');
      const resolvedLogo = resolved || p?.logoUrl || '';
      setLogoUrl(resolvedLogo);

      const phases = Array.isArray(raw) && raw.length > 0
        ? raw.filter((k) => [...MODULE_PHASES.map((m) => m.key), 'ai-analys'].includes(k))
        : [...MODULE_PHASES.map((m) => m.key), 'ai-analys'];
      const savedTotal = hasRoleLimits ? (p.adminLimit || 0) + (p.workerLimit || 0) : (p && p.userLimit != null ? p.userLimit : 10);
      setLastSavedSnapshot({
        companyName: (p && (p.companyName || p.name)) || cid || '',
        enabled: typeof p?.enabled === 'boolean' ? p.enabled : true,
        userLimit: String(savedTotal),
        adminLimit: String((p && p.adminLimit != null) ? p.adminLimit : ''),
        workerLimit: String((p && p.workerLimit != null) ? p.workerLimit : ''),
        enabledPhases: [...phases],
        logoUrl: resolvedLogo,
      });
    } catch (e) {
      setError(e?.message || 'Kunde inte ladda företag');
      setProfile(null);
      setEnabledPhases([]);
      setLastSavedSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [cid]);

  useEffect(() => {
    if (visible && cid) loadProfile();
    if (visible) setActiveTab('oversikt');
    if (!visible) {
      setProfile(null);
      setEnabledPhases([]);
      setError('');
      setLastSavedSnapshot(null);
    }
  }, [visible, cid, loadProfile]);

  const isDirty = useMemo(() => {
    const profileDirty = lastSavedSnapshot
      ? !(
          (companyNameDraft || '').trim() === (lastSavedSnapshot.companyName || '').trim()
          && companyEnabled === lastSavedSnapshot.enabled
          && (() => {
            const derivedTotal = (parseInt(String(adminLimitDraft || '0').trim(), 10) || 0) + (parseInt(String(workerLimitDraft || '0').trim(), 10) || 0);
            return derivedTotal === parseInt(String(lastSavedSnapshot.userLimit || '0').trim(), 10);
          })()
          && String(adminLimitDraft || '').trim() === String(lastSavedSnapshot.adminLimit || '').trim()
          && String(workerLimitDraft || '').trim() === String(lastSavedSnapshot.workerLimit || '').trim()
          && JSON.stringify([...enabledPhases].sort()) === JSON.stringify([...(lastSavedSnapshot.enabledPhases || [])].sort())
          && (logoUrl || '') === (lastSavedSnapshot.logoUrl || '')
        )
      : false;
    const planeringDirty = lastSavedPlaneringTabs != null
      && JSON.stringify(planeringTabs) !== JSON.stringify(lastSavedPlaneringTabs);
    return profileDirty || planeringDirty;
  }, [lastSavedSnapshot, companyNameDraft, companyEnabled, adminLimitDraft, workerLimitDraft, enabledPhases, logoUrl, planeringTabs, lastSavedPlaneringTabs]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [visible]);

  const toggleModule = useCallback((key) => {
    setEnabledPhases((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!cid) return;
    setSaving(true);
    setError('');
    try {
      const current = profile || {};
      const nextProfile = { ...current, updatedAt: new Date().toISOString() };

      nextProfile.enabledPhases = enabledPhases.slice();
      nextProfile.companyName = (companyNameDraft || '').trim() || current.companyName;
      nextProfile.enabled = companyEnabled;
      const adminNum = parseInt(String(adminLimitDraft || '').trim(), 10);
      const workerNum = parseInt(String(workerLimitDraft || '').trim(), 10);
      const adminLimit = (Number.isFinite(adminNum) && adminNum >= 0) ? adminNum : 0;
      const workerLimit = (Number.isFinite(workerNum) && workerNum >= 0) ? workerNum : 0;
      nextProfile.adminLimit = adminLimit;
      nextProfile.workerLimit = workerLimit;
      nextProfile.userLimit = adminLimit + workerLimit;

      await saveCompanyProfile(cid, nextProfile);

      if ((companyNameDraft || '').trim() !== (current.companyName || current.name || '')) {
        try {
          await setCompanyNameRemote({ companyId: cid, companyName: (companyNameDraft || '').trim() });
        } catch (_e) {}
      }
      if (typeof current.enabled !== 'undefined' && current.enabled !== companyEnabled) {
        try {
          await setCompanyStatusRemote({ companyId: cid, enabled: companyEnabled, deleted: false });
        } catch (_e) {}
      }
      const totalLimit = adminLimit + workerLimit;
      if (totalLimit !== (current.userLimit ?? 0)) {
        try {
          await setCompanyUserLimitRemote({ companyId: cid, userLimit: totalLimit });
        } catch (_e) {}
      }

      const updated = await fetchCompanyProfile(cid);
      setProfile(updated || null);
      setUserLimitDraft(String(totalLimit));
      setLastSavedSnapshot({
        companyName: (companyNameDraft || '').trim(),
        enabled: companyEnabled,
        userLimit: String(totalLimit),
        adminLimit: String(adminLimitDraft || '').trim(),
        workerLimit: String(workerLimitDraft || '').trim(),
        enabledPhases: enabledPhases.slice(),
        logoUrl: logoUrl || '',
      });
      if (lastSavedPlaneringTabs != null) {
        try {
          await AsyncStorage.setItem(`${PLANERING_STORAGE_PREFIX}_tabs_${cid}`, JSON.stringify(planeringTabs));
          setLastSavedPlaneringTabs(planeringTabs.slice());
        } catch (_e) {}
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      setError(e?.message || 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  }, [cid, profile, enabledPhases, companyNameDraft, companyEnabled, adminLimitDraft, workerLimitDraft, logoUrl, planeringTabs, lastSavedPlaneringTabs]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKeyCapture = (e) => {
      if (e.key === 'Escape') subModalWasOpenWhenEscPressedRef.current = isSubModalOpenRef.current;
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (isSubModalOpenRef.current) return;
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === 'Enter' && !saving && isDirty && cid) {
        const el = typeof document !== 'undefined' ? document.activeElement : null;
        const tag = el && el.tagName ? String(el.tagName).toUpperCase() : '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', onKeyCapture, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKeyCapture, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [visible, onClose, saving, isDirty, cid, handleSave]);

  const handleLogoUpload = useCallback(async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !cid) return;
    try {
      const url = await uploadCompanyLogo({ companyId: cid, file });
      setLogoUrl(url || '');
      const p = await fetchCompanyProfile(cid);
      const next = { ...(p || {}), logoUrl: url || (p?.logoUrl), updatedAt: new Date().toISOString() };
      await saveCompanyProfile(cid, next);
      setProfile(next);
    } catch (err) {
      setError(err?.message || 'Kunde inte ladda upp logotyp');
    }
  }, [cid]);

  /** Öppna register-modal (Kontoplan, Byggdelar, Kategorier, Mallar) ovanpå företagsinställningar – samma modal som från railen. */
  const openRegisterLink = useCallback((item) => {
    if (item.comingSoon) {
      Alert.alert('Kommer snart', 'Denna funktion kommer snart.');
      return;
    }
    if (item.openModal === 'openKontoplanModal') openKontoplanModal?.(cid);
    if (item.openModal === 'openByggdelModal') openByggdelModal?.(cid);
    if (item.openModal === 'openKategoriModal') openKategoriModal?.(cid);
    if (item.openModal === 'openMallarModal') openMallarModal?.(cid);
  }, [cid, openKontoplanModal, openByggdelModal, openKategoriModal, openMallarModal]);

  const companyName = (profile && (profile.companyName || profile.name)) || cid || 'Företag';
  const statusText = profile?.deleted ? 'Dolt' : companyEnabled ? 'Aktivt' : 'Inaktivt';
  const adminLimitNum = parseInt(String(adminLimitDraft || '0').trim(), 10);
  const workerLimitNum = parseInt(String(workerLimitDraft || '0').trim(), 10);
  const totalFromRoleLimits = (Number.isFinite(adminLimitNum) && adminLimitNum >= 0 ? adminLimitNum : 0) + (Number.isFinite(workerLimitNum) && workerLimitNum >= 0 ? workerLimitNum : 0);
  const userLimitNum = parseInt(String(userLimitDraft || '0').trim(), 10);
  const userLimitNumber = totalFromRoleLimits > 0 ? totalFromRoleLimits : (Number.isFinite(userLimitNum) ? userLimitNum : 10);
  const activeModulesCount = enabledPhases.length;
  const rawUpdated = profile?.updatedAt;
  const lastUpdated = !rawUpdated ? null : typeof rawUpdated === 'string' ? new Date(rawUpdated) : (typeof rawUpdated?.toDate === 'function' ? rawUpdated.toDate() : rawUpdated);
  const lastUpdatedText = lastUpdated && typeof lastUpdated.toLocaleString === 'function' ? lastUpdated.toLocaleString('sv-SE') : '—';

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: 1200,
    defaultHeight: 700,
    minWidth: 520,
    minHeight: 400,
  });

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (subModalWasOpenWhenEscPressedRef.current) { subModalWasOpenWhenEscPressedRef.current = false; return; } onClose?.(); }} statusBarTranslucent>
      <View style={[styles.overlay, overlayStyle]}>
        <Pressable style={[styles.box, boxStyle]} onPress={(e) => e?.stopPropagation?.()}>
          <View
            style={[styles.header, headerProps.style]}
            {...(Platform.OS === 'web' ? { onMouseDown: headerProps.onMouseDown } : {})}
          >
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name="business-outline" size={16} color={ICON_RAIL.iconColorActive} />
              </View>
              <Text style={styles.title} numberOfLines={1}>{companyName}</Text>
              <Text style={styles.titleDot}>•</Text>
              <Text style={styles.subtitle} numberOfLines={1}>Företagsinställningar</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="Stäng"
              {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
            >
              <Ionicons name="close" size={20} color={ICON_RAIL.iconColorActive} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <LoadingState message="Laddar…" size="large" />
          ) : (
            <>
              {/* Statusrad */}
              <View style={styles.statusRow}>
                <View style={styles.statusCard}>
                  <Text style={styles.statusCardLabel}>Plan</Text>
                  <Text style={styles.statusCardValue}>Enterprise</Text>
                </View>
                <View style={styles.statusCard}>
                  <Text style={styles.statusCardLabel}>Moduler</Text>
                  <Text style={styles.statusCardValue}>{activeModulesCount} / 5 aktiva</Text>
                </View>
                <View style={styles.statusCard}>
                  <Text style={styles.statusCardLabel}>Användare</Text>
                  <Text style={styles.statusCardValue}>{memberCount ?? '—'} / {userLimitNumber}</Text>
                </View>
                <View style={styles.statusCard}>
                  <Text style={styles.statusCardLabel}>Status</Text>
                  <Text style={styles.statusCardValue}>{statusText}</Text>
                </View>
                <View style={styles.statusCard}>
                  <Text style={styles.statusCardLabel}>Senast uppdaterad</Text>
                  <Text style={styles.statusCardValue}>{lastUpdatedText}</Text>
                </View>
              </View>

              {/* Flikar */}
              <View style={styles.tabRow}>
                {TABS.map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.tab, effectiveTab === tab.key && styles.tabActive]}
                    onPress={() => {
                      userHasChosenTabRef.current = true;
                      setActiveTab(tab.key);
                    }}
                  >
                    <Text style={[styles.tabLabel, effectiveTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {effectiveTab === 'oversikt' && (
                  <View style={styles.section}>
                    <View style={[styles.card, { flexDirection: 'row', flexWrap: 'wrap', gap: 24 }]}>
                      <View style={styles.logoWrap}>
                        <Text style={styles.sectionTitle}>Företagslogga</Text>
                        <TouchableOpacity
                          onPress={() => Platform.OS === 'web' && fileInputRef.current?.click()}
                          style={{ alignItems: 'flex-start', width: '100%' }}
                        >
                          <View style={styles.logoPlaceholder}>
                            {logoUrl ? (
                              <Image source={{ uri: logoUrl }} style={styles.logoImg} resizeMode="contain" />
                            ) : (
                              <Ionicons name="image-outline" size={40} color="#94a3b8" />
                            )}
                          </View>
                          {Platform.OS === 'web' && (
                            <>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleLogoUpload}
                              />
                              <Pressable
                                style={styles.bytBildBtn}
                                onPress={() => fileInputRef.current?.click()}
                              >
                                <Text style={styles.bytBildBtnText}>Byt bild</Text>
                              </Pressable>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                      <View style={{ flex: 1, minWidth: 200 }}>
                        <Text style={styles.sectionTitle}>Företagsnamn</Text>
                        <TextInput
                          style={[styles.input, styles.inputSingleLine, { flex: 1, minWidth: '100%' }]}
                          value={companyNameDraft}
                          onChangeText={setCompanyNameDraft}
                          placeholder="Företagsnamn"
                          placeholderTextColor="#94a3b8"
                          multiline={false}
                          numberOfLines={1}
                        />
                        <View style={[styles.cardRow, styles.cardRowLast, { marginTop: 16 }]}>
                          <Text style={styles.infoLabel}>Status</Text>
                          <Switch value={companyEnabled} onValueChange={setCompanyEnabled} trackColor={{ false: '#cbd5e1', true: '#86efac' }} thumbColor="#fff" />
                        </View>
                        <View style={styles.cardRow}>
                          <Text style={styles.infoLabel}>Användargräns</Text>
                          <Text style={styles.infoValue}>{userLimitNumber} st</Text>
                        </View>
                        <View style={styles.cardRow}>
                          <Text style={styles.infoLabel}>Aktiva användare</Text>
                          <Text style={styles.infoValue}>{memberCount ?? '—'}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                {effectiveTab === 'moduler' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Aktiverade moduler</Text>
                    <Text style={[styles.infoLabel, { marginBottom: 12 }]}>
                      Aktivera vilka moduler företaget ska ha. Dessa styr synlighet i rail och tillgängliga funktioner.
                    </Text>
                    <View style={styles.moduleGrid}>
                      {ALL_MODULES.map((mod) => {
                        const active = enabledPhases.includes(mod.key);
                        const isComingSoon = mod.comingSoon;
                        return (
                          <TouchableOpacity
                            key={mod.key}
                            style={[styles.moduleCard, active && styles.moduleCardActive]}
                            onPress={() => {
                              if (isComingSoon) {
                                Alert.alert('Kommer snart', 'Denna modul är under utveckling.');
                              } else {
                                toggleModule(mod.key);
                              }
                            }}
                            activeOpacity={0.8}
                          >
                            <View style={styles.moduleCardIcon}>
                              <Ionicons name={mod.icon} size={22} color="#1976D2" />
                            </View>
                            {isComingSoon && (
                              <View style={styles.moduleCardBadge}>
                                <Text style={styles.moduleCardBadgeText}>Kommer snart</Text>
                              </View>
                            )}
                            <Text style={styles.moduleCardName}>{mod.name}</Text>
                            <Text style={styles.moduleCardDesc}>{mod.description}</Text>
                            {!isComingSoon && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.infoLabel}>{active ? 'Aktiv' : 'Inaktiv'}</Text>
                                <View
                                  {...(Platform.OS === 'web' ? { onClick: (e) => e.stopPropagation() } : {})}
                                  onStartShouldSetResponder={() => true}
                                >
                                  <Switch value={active} onValueChange={() => toggleModule(mod.key)} trackColor={{ false: '#cbd5e1', true: '#86efac' }} thumbColor="#fff" />
                                </View>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {effectiveTab === 'licenser' && (() => {
                  const totalLicenses = userLimitNumber;
                  const used = typeof memberCount === 'number' ? memberCount : 0;
                  const percent = totalLicenses > 0 ? Math.round((used / totalLicenses) * 100) : 0;
                  const progressColor = percent >= 90 ? '#DC2626' : percent >= 70 ? '#D97706' : '#16A34A';
                  const showWarning = percent >= 90;
                  const admins = typeof adminCount === 'number' ? adminCount : 0;
                  const users = typeof userCount === 'number' ? userCount : 0;
                  return (
                    <View style={styles.section}>
                      <View style={styles.licenseGrid}>
                        <View style={styles.licenseBox}>
                          <Text style={styles.licenseBoxTitle}>Totalt antal licenser</Text>
                          <Text style={styles.licenseBoxValue}>{used} / {totalLicenses}</Text>
                          <Text style={styles.licenseBoxSub}>Använda av totalt</Text>
                        </View>
                        <View style={styles.licenseBox}>
                          <Text style={styles.licenseBoxTitle}>Admin</Text>
                          <Text style={styles.licenseBoxValue}>{admins} st</Text>
                          <Text style={styles.licenseBoxSub}>Antal</Text>
                        </View>
                        <View style={styles.licenseBox}>
                          <Text style={styles.licenseBoxTitle}>Användare</Text>
                          <Text style={styles.licenseBoxValue}>{users} st</Text>
                          <Text style={styles.licenseBoxSub}>Antal</Text>
                        </View>
                      </View>

                      <View style={styles.progressSection}>
                        {showWarning && (
                          <View style={[styles.warningBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                            <Ionicons name="warning-outline" size={20} color="#DC2626" />
                            <Text style={[styles.warningBannerText, { color: '#B91C1C' }]}>Ni använder över 90% av era licenser.</Text>
                          </View>
                        )}
                        <Text style={styles.progressLabel}>
                          Licensutnyttjande: {used} av {totalLicenses} ({percent}%)
                        </Text>
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${Math.min(100, percent)}%`, backgroundColor: progressColor }]} />
                        </View>
                      </View>

                      <View style={styles.licenseLimitCard}>
                        <Text style={styles.sectionTitle}>Licensgräns: Admin</Text>
                        <Text style={[styles.infoLabel, { marginBottom: 8 }]}>
                          Max antal användare med roll Admin.
                        </Text>
                        <View style={[styles.cardRow, styles.cardRowLast]}>
                          <Text style={styles.infoLabel}>Antal</Text>
                          <TextInput
                            style={styles.input}
                            value={adminLimitDraft}
                            onChangeText={setAdminLimitDraft}
                            keyboardType="number-pad"
                            placeholder="0"
                          />
                        </View>
                      </View>

                      <View style={styles.licenseLimitCard}>
                        <Text style={styles.sectionTitle}>Licensgräns: Användare</Text>
                        <Text style={[styles.infoLabel, { marginBottom: 8 }]}>
                          Max antal användare med roll Användare.
                        </Text>
                        <View style={[styles.cardRow, styles.cardRowLast]}>
                          <Text style={styles.infoLabel}>Antal</Text>
                          <TextInput
                            style={styles.input}
                            value={workerLimitDraft}
                            onChangeText={setWorkerLimitDraft}
                            keyboardType="number-pad"
                            placeholder="0"
                          />
                        </View>
                      </View>
                    </View>
                  );
                })()}

                {effectiveTab === 'anvandare' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Användare</Text>
                    <Text style={[styles.infoLabel, { marginBottom: 12 }]}>
                      Hantera användare och inställningar för företaget.
                    </Text>
                    <CompanyUsersContent
                      companyId={cid}
                      companyName={companyName}
                      embedded={true}
                      userLimit={userLimitNumber}
                    />
                  </View>
                )}

                {effectiveTab === 'sharepoint' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>SharePoint</Text>
                    <Text style={[styles.infoLabel, { marginBottom: 12 }]}>
                      Siter som företaget har tillgång till eller skapat. Hantera och öppna siter här.
                    </Text>
                    <CompanySharePointContent companyId={cid} companyName={companyName} />
                  </View>
                )}

                {effectiveTab === 'ai-installningar' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>AI-analys</Text>
                    <Text style={[styles.infoLabel, { marginBottom: 12 }]}>
                      Företagets extra instruktioner till AI per analystyp (Förfrågningsunderlag, Ritningar).
                    </Text>
                    <CompanyAIPromptsContent companyId={cid} />
                  </View>
                )}

                {effectiveTab === 'register' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Register</Text>
                    <Text style={[styles.infoLabel, { marginBottom: 12 }]}>
                      Kontoplan, byggdelar, kategorier och mallar för företaget.
                    </Text>
                    <View style={styles.dataLinkGrid}>
                      {REGISTER_LINKS.map((item) => (
                        <TouchableOpacity
                          key={item.key}
                          style={styles.dataLinkCard}
                          onPress={() => openRegisterLink(item)}
                          activeOpacity={0.8}
                        >
                          {item.comingSoon && (
                            <View style={[styles.moduleCardBadge, { position: 'absolute', top: 8, right: 8 }]}>
                              <Text style={styles.moduleCardBadgeText}>Kommer snart</Text>
                            </View>
                          )}
                          <View style={styles.dataLinkIcon}>
                            <Ionicons name={item.icon} size={20} color="#64748b" />
                          </View>
                          <Text style={styles.dataLinkLabel}>{item.label}</Text>
                          <Text style={styles.dataLinkDesc}>{item.description}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {effectiveTab === 'planering' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Planeringsflikar</Text>
                    <Text style={[styles.infoLabel, { marginBottom: 12 }]}>
                      Skapa och hantera flikar för resursplaneringen (t.ex. Entreprenad, Byggservice, Måleri). Synliga flikar visas i planeringsvyn; dölj istället för att radera om du vill behålla historik.
                    </Text>
                    {!planeringTabsLoaded ? (
                      <Text style={styles.infoLabel}>Laddar…</Text>
                    ) : (
                      <>
                        <View style={[styles.card, { marginBottom: 16 }]}>
                          <View style={styles.planeringAddRow}>
                            <TextInput
                              style={[styles.input, styles.planeringAddInput]}
                              value={newPlaneringTabName}
                              onChangeText={setNewPlaneringTabName}
                              placeholder="T.ex. Byggservice 2026"
                              placeholderTextColor="#94a3b8"
                              onSubmitEditing={addPlaneringTab}
                            />
                            <View style={styles.planeringAddCheckboxGroup}>
                              {PLANNING_TYPES.map((opt) => (
                                <Pressable
                                  key={opt.value}
                                  style={[styles.planeringAddCheckbox, newPlaneringTabType === opt.value && styles.planeringAddCheckboxSelected]}
                                  onPress={() => setNewPlaneringTabType(opt.value)}
                                >
                                  <View style={[styles.planeringAddCheckboxBox, newPlaneringTabType === opt.value && styles.planeringAddCheckboxBoxChecked]}>
                                    {newPlaneringTabType === opt.value ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                                  </View>
                                  <Text style={styles.planeringAddCheckboxLabel}>{opt.label}</Text>
                                </Pressable>
                              ))}
                            </View>
                            <TouchableOpacity
                              style={[styles.footerBtnPrimary, styles.planeringAddBtn]}
                              onPress={addPlaneringTab}
                              disabled={!newPlaneringTabName.trim()}
                            >
                              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Lägg till flik</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.planeringAddInfo}>
                            {PLANNING_TYPES.find((o) => o.value === newPlaneringTabType)?.infoText ?? ''}
                          </Text>
                        </View>
                        <Text style={[styles.sectionTitle, { marginTop: 4 }]}>
                          Flikar ({planeringTabs.length}) · {planeringTabs.filter((t) => t.visible).length} synliga
                        </Text>
                        {planeringTabs.length === 0 ? (
                          <Text style={[styles.infoLabel, { marginTop: 8 }]}>
                            Inga flikar än. Lägg till en ovan – de visas sedan i planeringsvyn.
                          </Text>
                        ) : (
                          <View style={styles.planeringList}>
                            {planeringTabs.map((tab, idx) => {
                              const isHovered = Platform.OS === 'web' && hoveredPlaneringTabId === tab.id;
                              return (
                                <View
                                  key={tab.id}
                                  style={[
                                    styles.planeringRow,
                                    idx === planeringTabs.length - 1 && styles.planeringRowLast,
                                    isHovered && styles.planeringRowHover,
                                  ]}
                                  onMouseEnter={Platform.OS === 'web' ? () => setHoveredPlaneringTabId(tab.id) : undefined}
                                  onMouseLeave={Platform.OS === 'web' ? () => setHoveredPlaneringTabId(null) : undefined}
                                  onContextMenu={
                                    Platform.OS === 'web'
                                      ? (e) => {
                                          e?.preventDefault?.();
                                          const x = e?.nativeEvent?.clientX ?? e?.clientX ?? 0;
                                          const y = e?.nativeEvent?.clientY ?? e?.clientY ?? 0;
                                          setPlaneringContextMenu({ x, y, tab });
                                        }
                                      : undefined
                                  }
                                >
                                  <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text
                                      style={[styles.planeringRowLabel, !tab.visible && styles.planeringRowLabelHidden]}
                                      numberOfLines={1}
                                    >
                                      {tab.name}
                                    </Text>
                                    <Text style={styles.planeringRowType} numberOfLines={1}>
                                      Typ: {tab.planningType === 'service' ? 'Service' : 'Entreprenad'}
                                    </Text>
                                  </View>
                                  <View style={styles.planeringRowActions}>
                                    <Text style={styles.planeringRowSynlig}>Synlig</Text>
                                    <Switch
                                      value={tab.visible}
                                      onValueChange={() => togglePlaneringTabVisible(tab.id)}
                                      trackColor={{ false: '#cbd5e1', true: '#86efac' }}
                                      thumbColor="#fff"
                                    />
                                    <TouchableOpacity
                                      onPress={() => removePlaneringTab(tab.id)}
                                      style={styles.planeringRowDelete}
                                      accessibilityLabel={`Radera ${tab.name}`}
                                    >
                                      <Ionicons name="trash-outline" size={18} color="#94a3b8" />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}

                {error ? <Text style={styles.error}>{error}</Text> : null}
              </ScrollView>

              {planeringContextMenu != null && (
                <ContextMenu
                  visible
                  x={planeringContextMenu.x}
                  y={planeringContextMenu.y}
                  items={[{ key: 'rename', label: 'Byt namn' }]}
                  onSelect={(item) => {
                    if (item?.key === 'rename' && planeringContextMenu?.tab) {
                      setPlaneringRenameTab(planeringContextMenu.tab);
                      setPlaneringRenameDraft(planeringContextMenu.tab.name);
                    }
                    setPlaneringContextMenu(null);
                  }}
                  onClose={() => setPlaneringContextMenu(null)}
                  compact
                />
              )}

              {planeringRenameTab != null && (
                <Modal
                  visible
                  transparent
                  animationType="fade"
                  onRequestClose={() => {
                    setPlaneringRenameTab(null);
                    setPlaneringRenameDraft('');
                  }}
                >
                  <View style={styles.planeringRenameOverlay}>
                    <Pressable
                      style={StyleSheet.absoluteFill}
                      onPress={() => {
                        setPlaneringRenameTab(null);
                        setPlaneringRenameDraft('');
                      }}
                    />
                    <View
                      style={styles.planeringRenameBox}
                      onStartShouldSetResponder={() => true}
                    >
                      <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Byt namn på flik</Text>
                      <TextInput
                        style={[styles.input, { marginBottom: 16 }]}
                        value={planeringRenameDraft}
                        onChangeText={setPlaneringRenameDraft}
                        placeholder="Namn på flik"
                        placeholderTextColor="#94a3b8"
                        onSubmitEditing={() => renamePlaneringTab(planeringRenameTab.id, planeringRenameDraft)}
                      />
                      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
                        <TouchableOpacity
                          style={[styles.footerBtn, { paddingVertical: 10, paddingHorizontal: 16 }]}
                          onPress={() => {
                            setPlaneringRenameTab(null);
                            setPlaneringRenameDraft('');
                          }}
                        >
                          <Text style={styles.infoValue}>Avbryt</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.footerBtnPrimary, { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 }]}
                          onPress={() => renamePlaneringTab(planeringRenameTab.id, planeringRenameDraft)}
                          disabled={!planeringRenameDraft.trim()}
                        >
                          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Spara</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </Modal>
              )}

              <View style={[styles.footer, saving && styles.saving]}>
                <TouchableOpacity style={styles.footerBtn} onPress={onClose}>
                  <Text style={styles.infoValue}>Stäng</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.footerBtn,
                    styles.footerBtnPrimary,
                    (!isDirty || saving) && styles.footerBtnPrimaryDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={!isDirty || saving}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                    {saving ? 'Sparar…' : 'Spara ändringar'}
                  </Text>
                </TouchableOpacity>
              </View>

              {(saving || saveSuccess) && (
                <View style={styles.saveOverlay} pointerEvents={saving ? 'auto' : 'none'}>
                  {saving ? (
                    <View style={styles.saveLoadingBox}>
                      <Ionicons name="hourglass-outline" size={24} color="#fff" />
                      <Text style={styles.saveSuccessText}>Sparar…</Text>
                    </View>
                  ) : (
                    <View style={styles.saveSuccessBox}>
                      <Ionicons name="checkmark-circle" size={24} color="#fff" />
                      <Text style={styles.saveSuccessText}>Sparat</Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}
          {resizeHandles}
        </Pressable>
      </View>
    </Modal>
  );
}
