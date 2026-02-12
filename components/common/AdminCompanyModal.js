/**
 * Admin modal: Företag (superadmin) – flikbaserat kontrollcenter.
 * Öppnas från rail Superadmin → Företag → klick på ett företag.
 * Flikar: Översikt, Moduler, Licenser, Användare, Sharepoint, Register.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  adminFetchCompanyMembers,
  fetchCompanyMembers,
  fetchCompanyProfile,
  resolveCompanyLogoUrl,
  saveCompanyProfile,
  setCompanyStatusRemote,
  setCompanyUserLimitRemote,
  setCompanyNameRemote,
  uploadCompanyLogo,
} from '../firebase';
import { ICON_RAIL, PROGRESS_THEME } from '../../constants/iconRailTheme';
import { PROJECT_PHASES } from '../../features/projects/constants';
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';
import CompanyUsersContent from '../CompanyUsersContent';
import { AdminModalContext } from './AdminModalContext';

const MODULE_PHASES = PROJECT_PHASES.filter((p) => p.key !== 'free');
const MODULE_DISPLAY_NAMES = {
  kalkylskede: 'Kalkyl',
  produktion: 'Produktion',
  avslut: 'Avslutat',
  eftermarknad: 'Eftermarknad',
};

// Alla 5 moduler inkl. AI-analys. Produktion, Avslutat, Eftermarknad kan aktiveras för rail-layout; klick i rail visar "Kommer snart".
const ALL_MODULES = [
  { key: 'kalkylskede', name: 'Kalkyl', description: 'Kalkylskede, offerter och projekthantering.', icon: 'calculator-outline', comingSoon: false },
  { key: 'produktion', name: 'Produktion', description: 'Produktionsfas och fältarbete.', icon: 'construct-outline', comingSoon: false },
  { key: 'avslut', name: 'Avslutat', description: 'Avslut och slutleverans.', icon: 'checkmark-circle-outline', comingSoon: false },
  { key: 'eftermarknad', name: 'Eftermarknad', description: 'Eftermarknad och underhåll.', icon: 'time-outline', comingSoon: false },
  { key: 'ai-analys', name: 'AI-analys', description: 'AI-stöd för analys och beslut.', icon: 'sparkles-outline', comingSoon: false },
];

const TABS = [
  { key: 'oversikt', label: 'Översikt', icon: 'grid-outline' },
  { key: 'moduler', label: 'Moduler', icon: 'apps-outline' },
  { key: 'licenser', label: 'Licenser', icon: 'people-outline' },
  { key: 'anvandare', label: 'Användare', icon: 'people-outline' },
  { key: 'sharepoint', label: 'Sharepoint', icon: 'cloud-outline' },
  { key: 'register', label: 'Register', icon: 'folder-open-outline' },
  { key: 'ai-installningar', label: 'AI-Inställningar', icon: 'sparkles-outline' },
];

const REGISTER_LINKS = [
  { key: 'kontoplan', label: 'Kontoplan', description: 'Kontoplan och konton', icon: 'list-outline', openModal: 'openKontoplanModal', comingSoon: false },
  { key: 'byggdelar', label: 'Byggdelar', description: 'Byggdelstabell och koder', icon: 'layers-outline', openModal: 'openByggdelModal', comingSoon: false },
  { key: 'kategorier', label: 'Kategorier', description: 'Kategorier och taggar', icon: 'pricetag-outline', openModal: 'openKategoriModal', comingSoon: false },
  { key: 'mallar', label: 'Mallar', description: 'Mallar för kontroller', icon: 'document-text-outline', openModal: 'openMallarModal', comingSoon: true },
];

const AI_INSTALLNINGAR_LINKS = [
  { key: 'ai', label: 'AI-inställningar', description: 'AI-prompter och inställningar', icon: 'sparkles-outline', openModal: 'openAIPromptsModal' },
];

const SHAREPOINT_LINKS = [
  { key: 'sharepoint', label: 'SharePoint', description: 'SharePoint och mappstruktur', icon: 'cloud-outline', screen: 'ManageSharePointNavigation' },
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
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
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
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
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
  loading: { padding: 32, alignItems: 'center' },
  loadingText: { fontSize: 13, color: '#64748b' },
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

export default function AdminCompanyModal({ visible, companyId, onClose }) {
  const cid = String(companyId || '').trim();
  const {
    openKontoplanModal,
    openByggdelModal,
    openKategoriModal,
    openMallarModal,
    openAIPromptsModal,
    navigationRef,
  isSubModalOpen = false,
  } = useContext(AdminModalContext) || {};

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('oversikt');
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
    if (!lastSavedSnapshot) return false;
    const nameEq = (companyNameDraft || '').trim() === (lastSavedSnapshot.companyName || '').trim();
    const enabledEq = companyEnabled === lastSavedSnapshot.enabled;
    const derivedTotal = (parseInt(String(adminLimitDraft || '0').trim(), 10) || 0) + (parseInt(String(workerLimitDraft || '0').trim(), 10) || 0);
    const limitEq = derivedTotal === parseInt(String(lastSavedSnapshot.userLimit || '0').trim(), 10);
    const adminLimitEq = String(adminLimitDraft || '').trim() === String(lastSavedSnapshot.adminLimit || '').trim();
    const workerLimitEq = String(workerLimitDraft || '').trim() === String(lastSavedSnapshot.workerLimit || '').trim();
    const phasesEq = JSON.stringify([...enabledPhases].sort()) === JSON.stringify([...(lastSavedSnapshot.enabledPhases || [])].sort());
    const logoEq = (logoUrl || '') === (lastSavedSnapshot.logoUrl || '');
    return !(nameEq && enabledEq && limitEq && adminLimitEq && workerLimitEq && phasesEq && logoEq);
  }, [lastSavedSnapshot, companyNameDraft, companyEnabled, adminLimitDraft, workerLimitDraft, enabledPhases, logoUrl]);

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
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      setError(e?.message || 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  }, [cid, profile, enabledPhases, companyNameDraft, companyEnabled, adminLimitDraft, workerLimitDraft, logoUrl]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (isSubModalOpen) return;
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose, saving, isDirty, cid, handleSave, isSubModalOpen]);

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

  const openDataLink = useCallback((item) => {
    if (item.openModal) {
      if (item.openModal === 'openKontoplanModal') openKontoplanModal?.(cid);
      if (item.openModal === 'openByggdelModal') openByggdelModal?.(cid);
      if (item.openModal === 'openKategoriModal') openKategoriModal?.(cid);
      if (item.openModal === 'openMallarModal') openMallarModal?.(cid);
      if (item.openModal === 'openAIPromptsModal') openAIPromptsModal?.(cid);
      onClose?.();
    }
    if (item.screen && navigationRef?.current) {
      navigationRef.current.navigate(item.screen, { companyId: cid });
      onClose?.();
    }
  }, [cid, onClose, openKontoplanModal, openByggdelModal, openKategoriModal, openMallarModal, openAIPromptsModal, navigationRef]);

  /** Öppna register-modal (Kontoplan, Byggdelar, Kategorier) ovanpå företagsinställningar – stäng inte company-modalen. Mallar visar "Kommer snart". */
  const openRegisterLink = useCallback((item) => {
    if (item.comingSoon) {
      Alert.alert('Kommer snart', 'Mallar kommer snart.');
      return;
    }
    if (item.openModal === 'openKontoplanModal') openKontoplanModal?.(cid);
    if (item.openModal === 'openByggdelModal') openByggdelModal?.(cid);
    if (item.openModal === 'openKategoriModal') openKategoriModal?.(cid);
  }, [cid, openKontoplanModal, openByggdelModal, openKategoriModal]);

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
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
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
            <View style={styles.loading}>
              <Text style={styles.loadingText}>Laddar…</Text>
            </View>
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
                    style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                    onPress={() => setActiveTab(tab.key)}
                  >
                    <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {activeTab === 'oversikt' && (
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

                {activeTab === 'moduler' && (
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

                {activeTab === 'licenser' && (() => {
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

                {activeTab === 'anvandare' && (
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

                {activeTab === 'sharepoint' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Sharepoint</Text>
                    <Text style={[styles.infoLabel, { marginBottom: 12 }]}>
                      SharePoint och mappstruktur för företaget.
                    </Text>
                    <View style={styles.dataLinkGrid}>
                      {SHAREPOINT_LINKS.map((item) => (
                        <TouchableOpacity
                          key={item.key}
                          style={styles.dataLinkCard}
                          onPress={() => openDataLink(item)}
                          activeOpacity={0.8}
                        >
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

                {activeTab === 'ai-installningar' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>AI-Inställningar</Text>
                    <Text style={[styles.infoLabel, { marginBottom: 12 }]}>
                      AI-prompter och inställningar för företaget.
                    </Text>
                    <View style={styles.dataLinkGrid}>
                      {AI_INSTALLNINGAR_LINKS.map((item) => (
                        <TouchableOpacity
                          key={item.key}
                          style={styles.dataLinkCard}
                          onPress={() => openDataLink(item)}
                          activeOpacity={0.8}
                        >
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

                {activeTab === 'register' && (
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

                {error ? <Text style={styles.error}>{error}</Text> : null}
              </ScrollView>

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
