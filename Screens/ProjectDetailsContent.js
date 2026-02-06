import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View
} from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { v4 as uuidv4 } from 'uuid';
import { buildPdfHtmlForControl } from '../components/pdfExport';
import { emitProjectUpdated, onProjectUpdated } from '../components/projectBus';
import {
  embedImagesInControl,
  getWeekAndYear,
  isValidIsoDateYmd,
  normalizeControl,
  normalizeProject,
  persistDraftObject,
  readUriAsBase64,
  toDataUri,
} from './ProjectDetailsUtils';
import styles from './ProjectDetailsStyles';

import {
    ArbetsberedningControl,
    EgenkontrollControl,
    FuktmätningControl,
    MottagningskontrollControl,
    RiskbedömningControl,
    SkyddsrondControl,
} from '../features/kma/components/controls';
import ControlDetails from './ControlDetails';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DigitalKontrollHeaderLogo } from '../components/HeaderComponents';
import ProjectInternalNavigation from '../components/common/ProjectInternalNavigation';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from '../components/common/layoutConstants';
import { DEFAULT_CONTROL_TYPES, archiveCompanyProject, deleteControlFromFirestore, deleteDraftControlFromFirestore, fetchCompanyControlTypes, fetchCompanyMallar, fetchCompanyMembers, fetchCompanyProfile, fetchCompanyProject, fetchControlsForProject, fetchDraftControlsForProject, hasDuplicateProjectNumber, patchCompanyProject, updateSharePointProjectPropertiesFromFirestoreProject } from '../components/firebase';
import { enqueueFsExcelSync } from '../features/project-phases/phases/kalkylskede/services/fragaSvarExcelSyncQueue';
import { DEFAULT_PHASE, getProjectPhase } from '../features/projects/constants';
import ProjectDetailsInlineControl from './ProjectDetailsInlineControl';
import ProjectDetailsOverviewCard from './ProjectDetailsOverviewCard';
import ProjectDetailsOverviewPanel from './ProjectDetailsOverviewPanel';
import ProjectDetailsEditModal from './ProjectDetailsEditModal';
import ProjectDetailsSectionDocuments from './ProjectDetailsSectionDocuments';
import ProjectDetailsSectionKalkyl from './ProjectDetailsSectionKalkyl';
// Note: `expo-file-system` is used only on native; avoid static top-level import
// so web builds don't attempt to resolve native-only exports. Load dynamically
// inside functions when needed.
let FileSystem = null;

// Optional project-level summary HTML builder — not present in this repo by default.
const buildSummaryHtml = null;

export default function ProjectDetails({ route, navigation, inlineClose, refreshNonce }) {
  const { width: windowWidth } = useWindowDimensions();
              const [showControlTypeModal, setShowControlTypeModal] = useState(false);
            const [showDeleteModal, setShowDeleteModal] = useState(false);
            const [showDeleteWarning, setShowDeleteWarning] = useState(false);
            const [controlTypeScrollMetrics, setControlTypeScrollMetrics] = useState({
              contentHeight: 0,
              containerHeight: 0,
              scrollY: 0,
            });

            const controlTypeCanScroll = controlTypeScrollMetrics.contentHeight > (controlTypeScrollMetrics.containerHeight + 1);
            let controlTypeThumbHeight = 0;
            let controlTypeThumbTop = 0;
            if (controlTypeCanScroll) {
              const { containerHeight, contentHeight, scrollY } = controlTypeScrollMetrics;
              const minThumb = 24;
              const thumbHeightRaw = (containerHeight * containerHeight) / (contentHeight || 1);
              const thumbHeight = Math.max(minThumb, isFinite(thumbHeightRaw) ? thumbHeightRaw : minThumb);
              const maxThumbTop = Math.max(0, containerHeight - thumbHeight);
              const scrollableDistance = Math.max(0, contentHeight - containerHeight);
              const thumbTop = scrollableDistance > 0 ? (scrollY / scrollableDistance) * maxThumbTop : 0;
              controlTypeThumbHeight = thumbHeight;
              controlTypeThumbTop = thumbTop;
            }
          // Header on web is handled globally in App.js (breadcrumb + logos).
          // Keep the older native-only centered-logo header.
          React.useEffect(() => {
            if (Platform.OS === 'web') return;
            navigation.setOptions({
              headerTitle: () => (
                <View style={{ marginBottom: 4, marginLeft: -28 }}>
                  <DigitalKontrollHeaderLogo />
                </View>
              ),
              headerLeft: () => null,
              headerBackTitle: '',
            });
          }, [navigation]);
    // State för att låsa upp skapad-datum
    const [canEditCreated, setCanEditCreated] = useState(false);
        const handlePreviewPdf = async () => {
          if (!controls || controls.length === 0) return;
          setExportingPdf(true);
          try {
            try { Haptics.selectionAsync(); } catch {}

            // Prefer company profile logo for PDF (MVP branding: only on print/PDF)
            let profile = companyProfile;
            if (!profile && companyId) {
              try {
                profile = await fetchCompanyProfile(companyId);
                if (profile) setCompanyProfile(profile);
              } catch(_e) {}
            }
            const companyNameForPdf = profile?.name || profile?.companyName || project?.client || project?.name || 'FÖRETAG AB';
            const companyLogoFromProfile = profile?.logoUrl || null;

            // Try to use a local file path for the logo for better reliability
            let logoForPrint = companyLogoFromProfile || companyLogoUri || null;
            if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
              try {
                const fileName = 'company-logo.preview.png';
                const baseDir = (FileSystem && (FileSystem.cacheDirectory || FileSystem.documentDirectory)) ? (FileSystem.cacheDirectory || FileSystem.documentDirectory) : null;
                if (baseDir) {
                  const dest = baseDir + fileName;
                  const dl = await FileSystem.downloadAsync(logoForPrint, dest);
                  if (dl?.uri) logoForPrint = dl.uri;
                }
              } catch {}
            }

            // Convert logo to base64 (if possible) to avoid asset-loading issues
            let logoBase64 = null;
            try {
              logoBase64 = await readUriAsBase64(logoForPrint);
              if (!logoBase64) {
                // Try bundled asset fallback
                try {
                  const a = Asset.fromModule(require('../assets/images/foretag_ab.png'));
                  await Asset.loadAsync(a);
                  const local = a.localUri || a.uri;
                  if (local) {
                    logoBase64 = await readUriAsBase64(local);
                    if (logoBase64) logoForPrint = 'data:image/png;base64,' + logoBase64;
                  }
                } catch(_e) {
                  // ignore
                }
              } else {
                logoForPrint = 'data:image/png;base64,' + logoBase64;
              }
            } catch(e) { console.warn('[PDF] logo base64 conversion failed', e); }

            // Build HTML safely and log length to aid debugging blank PDFs
            let html;
            try {
              if (typeof buildSummaryHtml === 'function') {
                html = buildSummaryHtml(exportFilter, logoForPrint);
              } else {
                console.warn('[PDF] buildSummaryHtml not available, falling back to per-control builder');
                const companyObj = { name: companyNameForPdf, logoUrl: companyLogoFromProfile, logoBase64 };
                const preparedControls = await Promise.all((controls || []).map(c => embedImagesInControl(c)));
                html = (preparedControls || []).map(c => buildPdfHtmlForControl({ control: c, project, company: companyObj })).join('<div style="page-break-after:always"></div>');
              }
            } catch (hErr) {
              console.error('[PDF] error while building HTML for preview', hErr);
              html = null;
            }

            console.log('[PDF] preview HTML length:', html ? String(html).length : 0);
            if (!html || String(html).trim().length < 20) throw new Error('Empty or too-small HTML');

            try {
              const fileResult = await Print.printToFileAsync({ html });
              const pdfUri = fileResult?.uri;
              if (pdfUri) {
                try {
                  const avail = await Sharing.isAvailableAsync();
                  if (avail) await Sharing.shareAsync(pdfUri, { dialogTitle: 'Spara PDF' });
                  else setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri });
                } catch (shareErr) {
                  console.warn('[PDF] shareAsync failed, opening print dialog as fallback', shareErr);
                  await Print.printAsync({ uri: pdfUri });
                }
              } else {
                throw new Error('printToFileAsync returned no uri');
              }
            } catch(e) {
              console.warn('[PDF] printToFileAsync with logo/fallback failed, retrying without logo', e);
              try {
                let html2 = null;
                if (typeof buildSummaryHtml === 'function') html2 = buildSummaryHtml(exportFilter, null);
                else {
                  const preparedControls2 = await Promise.all((controls || []).map(c => embedImagesInControl(c)));
                  html2 = (preparedControls2 || []).map(c => buildPdfHtmlForControl({ control: c, project, company: { name: companyNameForPdf } })).join('<div style="page-break-after:always"></div>');
                }
                console.log('[PDF] retry HTML length:', html2 ? String(html2).length : 0);
                if (!html2 || String(html2).trim().length < 20) throw new Error('Empty retry HTML');
                const fileResult2 = await Print.printToFileAsync({ html: html2 });
                const pdfUri2 = fileResult2?.uri;
                if (pdfUri2) {
                  try {
                    const avail2 = await Sharing.isAvailableAsync();
                    if (avail2) await Sharing.shareAsync(pdfUri2, { dialogTitle: 'Spara PDF' });
                    else setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri2 });
                  } catch (shareErr2) {
                    console.warn('[PDF] shareAsync failed (retry), falling back to print dialog', shareErr2);
                    await Print.printAsync({ uri: pdfUri2 });
                  }
                } else {
                  throw new Error('printToFileAsync retry returned no uri');
                }
              } catch (err2) { throw err2; }
            }
          } catch(e) {
            console.error('[PDF] Preview error:', e);
            setNotice({ visible: true, text: 'Kunde inte förhandsvisa PDF' });
            setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
          } finally {
            setExportingPdf(false);
          }
        };
      // PDF export-funktion
      const handleExportPdf = async () => {
        if (!controls || controls.length === 0) return;
        setExportingPdf(true);
        try {
          try { Haptics.selectionAsync(); } catch {}

          // Prefer company profile logo for PDF (MVP branding: only on print/PDF)
          let profile = companyProfile;
          if (!profile && companyId) {
            try {
              profile = await fetchCompanyProfile(companyId);
              if (profile) setCompanyProfile(profile);
            } catch(_e) {}
          }
          const companyNameForPdf = profile?.name || profile?.companyName || project?.client || project?.name || 'FÖRETAG AB';
          const companyLogoFromProfile = profile?.logoUrl || null;

          let logoForPrint = companyLogoFromProfile || companyLogoUri || null;
          if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
            try {
                const fileName = 'company-logo.export.png';
              const baseDir = (FileSystem && (FileSystem.cacheDirectory || FileSystem.documentDirectory)) ? (FileSystem.cacheDirectory || FileSystem.documentDirectory) : null;
              if (baseDir) {
                const dest = baseDir + fileName;
                const dl = await FileSystem.downloadAsync(logoForPrint, dest);
                if (dl?.uri) logoForPrint = dl.uri;
              }
            } catch {}
          }
          // Try to convert logo to base64 for embedding
          let logoBase64 = null;
          try {
            logoBase64 = await readUriAsBase64(logoForPrint);
            if (!logoBase64) {
              try {
                const a = Asset.fromModule(require('../assets/images/foretag_ab.png'));
                await Asset.loadAsync(a);
                const local = a.localUri || a.uri;
                if (local) {
                  logoBase64 = await readUriAsBase64(local);
                  if (logoBase64) logoForPrint = 'data:image/png;base64,' + logoBase64;
                }
              } catch(_e) {}
            } else {
              logoForPrint = 'data:image/png;base64,' + logoBase64;
            }
          } catch(e) { console.warn('[PDF] logo base64 conversion failed', e); }

          // Bygg HTML för export (alla eller filtrerat) — säkrare bygg och logg
          let html;
          try {
            if (typeof buildSummaryHtml === 'function') html = buildSummaryHtml(exportFilter, logoForPrint);
            else {
                const companyObj = { name: companyNameForPdf, logoUrl: companyLogoFromProfile, logoBase64 };
                const preparedControls = await Promise.all((controls || []).map(c => embedImagesInControl(c)));
              html = (preparedControls || []).map(c => buildPdfHtmlForControl({ control: c, project, company: companyObj })).join('<div style="page-break-after:always"></div>');
            }
          } catch (hErr) {
            console.error('[PDF] error while building HTML for export', hErr);
            html = null;
          }
          console.log('[PDF] export HTML length:', html ? String(html).length : 0);
          try {
            if (!html || String(html).trim().length < 20) throw new Error('Empty export HTML');
            const fileResult = await Print.printToFileAsync({ html });
            const pdfUri = fileResult?.uri;
            if (pdfUri) {
              try {
                const avail = await Sharing.isAvailableAsync();
                if (avail) await Sharing.shareAsync(pdfUri, { dialogTitle: 'Spara PDF' });
                else setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri });
              } catch (shareErr) {
                console.warn('[PDF] shareAsync failed, falling back to open print dialog', shareErr);
                await Print.printAsync({ uri: pdfUri });
              }
            } else {
              throw new Error('printToFileAsync returned no uri');
            }
          } catch(e) {
            console.warn('[PDF] printToFileAsync with logo failed or HTML invalid, retrying without logo', e);
            try {
              let html2 = null;
              if (typeof buildSummaryHtml === 'function') html2 = buildSummaryHtml(exportFilter, null);
              else {
                const preparedControls2 = await Promise.all((controls || []).map(c => embedImagesInControl(c)));
                html2 = (preparedControls2 || []).map(c => buildPdfHtmlForControl({ control: c, project, company: { name: companyNameForPdf } })).join('<div style="page-break-after:always"></div>');
              }
              console.log('[PDF] retry export HTML length:', html2 ? String(html2).length : 0);
              if (!html2 || String(html2).trim().length < 20) throw new Error('Empty retry export HTML');
              const fileResult2 = await Print.printToFileAsync({ html: html2 });
              const pdfUri2 = fileResult2?.uri;
              if (pdfUri2) {
                try {
                  const avail2 = await Sharing.isAvailableAsync();
                  if (avail2) await Sharing.shareAsync(pdfUri2, { dialogTitle: 'Spara PDF' });
                  else setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri2 });
                } catch (shareErr2) {
                  console.warn('[PDF] shareAsync failed (retry), falling back to print dialog', shareErr2);
                  await Print.printAsync({ uri: pdfUri2 });
                }
              } else {
                throw new Error('printToFileAsync retry returned no uri');
              }
            } catch (err2) { throw err2; }
          }
          setNotice({ visible: true, text: 'PDF genererad' });
          setTimeout(() => setNotice({ visible: false, text: '' }), 3000);
        } catch(e) {
          console.error('[PDF] Export error:', e);
          setNotice({ visible: true, text: 'Kunde inte exportera PDF' });
          setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
        } finally {
          setExportingPdf(false);
        }
      };
    const [notice, setNotice] = useState({ visible: false, text: '' });
    const scrollRef = useRef(null);
  // Destructure navigation params
  const { project: initialProject, companyId, initialCreator, selectedAction } = route.params || {};
  
  // Local state for project that can be updated when project ID changes
  const [project, setProject] = useState(initialProject);

  // Hydrate full project from Firestore on open (important dates live on the project doc).
  useEffect(() => {
    const cid = String(companyId || '').trim();
    const pid = String(project?.id || '').trim();
    if (!cid || !pid) return;

    let cancelled = false;
    (async () => {
      try {
        const full = await fetchCompanyProject(cid, pid);
        if (cancelled) return;
        if (!full || typeof full !== 'object') return;

        const merged = normalizeProject({ ...(project || {}), ...full });
        setProject(merged);

        try {
          emitProjectUpdated(merged);
        } catch (_e) {}

        try {
          if (typeof navigation?.setParams === 'function') {
            navigation.setParams({ project: merged });
          }
        } catch (_e) {}
      } catch (e) {
        console.warn('[ProjectDetails] Could not hydrate project from Firestore:', e?.message || e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only re-hydrate when switching project.
  }, [companyId, project?.id]);
  
  // Internal navigation state
  const [activeSection, setActiveSection] = useState('overview');
  const [archivingProject, setArchivingProject] = useState(false);

  const normalizeInternalSectionId = React.useCallback((sectionId) => {
    if (sectionId === 'ue-offerter') return 'kalkyl';
    return sectionId;
  }, []);

  const handleArchiveProject = async () => {
    const cid = String(companyId || '').trim();
    const pid = String(project?.id || '').trim();
    if (!cid || !pid) {
      Alert.alert('Fel', 'Saknar projekt eller företag.');
      return;
    }
    setArchivingProject(true);
    try {
      const res = await archiveCompanyProject(cid, pid);
      if (res && res.ok) {
        try { Alert.alert('Klart', 'Projektet är arkiverat.'); } catch (_e) {}
        try { navigation?.goBack?.(); } catch (_e) {}
      } else {
        const msg = res?.error || 'Arkivering misslyckades.';
        Alert.alert('Fel', msg);
      }
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e || 'Arkivering misslyckades.'));
    } finally {
      setArchivingProject(false);
    }
  };

  // Backwards-compat: migrate legacy section id.
  useEffect(() => {
    if (activeSection === 'ue-offerter') {
      setActiveSection('kalkyl');
    }
  }, [activeSection]);
  
  // Update project state when route params change
  useEffect(() => {
    if (initialProject) {
      setProject(initialProject);
    }
  }, [initialProject]);
  
  // Listen for project updates (e.g., when project ID changes)
  useEffect(() => {
    if (!project?.id) return;
    
    const unsubscribe = onProjectUpdated((updatedProject) => {
      if (!updatedProject || !updatedProject.id) return;
      
      // Check if this is the same project (by comparing IDs or old ID)
      const currentId = String(project.id);
      const newId = String(updatedProject.id);
      
      if (currentId === newId) {
        // Same ID, just update the project
        setProject(updatedProject);
      } else if (updatedProject._idChanged && updatedProject._oldId) {
        // Project ID changed - check if old ID matches current project
        const oldId = String(updatedProject._oldId);
        if (currentId === oldId) {
          console.log('[ProjectDetails] Project ID changed, updating from', oldId, 'to', newId);
          const updated = { ...updatedProject };
          delete updated._oldId;
          delete updated._idChanged;
          setProject(updated);
        }
      }
    });
    
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [project?.id]);
  
  // Loading state for kalkylskede projects
  // Check if project is in a phase that uses PhaseLayout
  // Only phase-based structures (kalkylskede/produktion/avslut/eftermarknad) use PhaseLayout.
  // "Valfri mappstruktur" (phase key: free) falls back to the classic ProjectDetails view.
  let projectPhaseKey = null;
  let PhaseLayoutComponent = null;
  const PHASE_LAYOUT_KEYS = new Set(['kalkylskede', 'produktion', 'avslut', 'eftermarknad']);
  
  if (project && companyId && project.id) {
    try {
      const projectPhase = getProjectPhase(project);
      const candidatePhaseKey = projectPhase?.key || (!project?.phase ? DEFAULT_PHASE : null);
      projectPhaseKey = candidatePhaseKey && PHASE_LAYOUT_KEYS.has(candidatePhaseKey) ? candidatePhaseKey : null;
      
      // Lazy load PhaseLayout for all phases
      if (projectPhaseKey) {
        try {
          const phaseModule = require('../features/project-phases/phases/PhaseLayout');
          PhaseLayoutComponent = phaseModule.default;
        } catch (importErr) {
          console.error('[ProjectDetails] Error importing PhaseLayout:', importErr);
          projectPhaseKey = null; // Fall back to normal view
        }
      }
    } catch (err) {
      console.error('[ProjectDetails] Error checking phase:', err);
      projectPhaseKey = null;
    }
  }
  
  // Handler for phase change - updates project phase in hierarchy
  const handleProjectPhaseChange = React.useCallback(async (newPhaseKey) => {
    if (!project?.id || !companyId) return;
    
    try {
      // Update project phase
      const updatedProject = {
        ...project,
        phase: newPhaseKey,
        updatedAt: new Date().toISOString(),
      };
      
      // Emit update so HomeScreen can update hierarchy
      emitProjectUpdated(updatedProject);
      
      // Update local project state
      setProject(updatedProject);
      
      // Update navigation params
      if (typeof navigation?.setParams === 'function') {
        navigation.setParams({ project: updatedProject });
      }
    } catch (error) {
      console.error('[ProjectDetails] Error changing project phase:', error);
      throw error;
    }
  }, [project, companyId, navigation]);

  // If project has a phase, render the PhaseLayout (full width, no internal leftpanel)
  if (projectPhaseKey && companyId && project?.id && PhaseLayoutComponent) {
    try {
      return (
        <View style={{ flex: 1, backgroundColor: '#f4f6fa', width: '100%' }}>
          <PhaseLayoutComponent
            companyId={companyId}
            projectId={project.id}
            project={project}
            phaseKey={projectPhaseKey}
            hideLeftPanel={true}
            externalActiveSection={route?.params?.phaseActiveSection}
            externalActiveItem={route?.params?.phaseActiveItem}
            externalActiveNode={route?.params?.phaseActiveNode}
            afRelativePath={route?.params?.afRelativePath}
            setAfRelativePath={route?.params?.setAfRelativePath}
            afSelectedItemId={route?.params?.afSelectedItemId}
            setAfSelectedItemId={route?.params?.setAfSelectedItemId}
            bumpAfMirrorRefreshNonce={route?.params?.bumpAfMirrorRefreshNonce}
            onExternalSectionChange={route?.params?.onPhaseSectionChange}
            onExternalItemChange={route?.params?.onPhaseItemChange}
            onPhaseChange={handleProjectPhaseChange}
            reactNavigation={navigation}
          />
        </View>
      );
    } catch (err) {
      console.error('[ProjectDetails] Error rendering PhaseLayout:', err);
      // Fall through to normal rendering
    }
  }
  
  const [inlineControl, setInlineControl] = useState(null);
  const openInlineControl = useCallback((type, initialValues) => {
    if (!type) return;
    // Freeze the project snapshot at time of opening so the form can't "jump"
    // if parent selection changes.
    setInlineControl({ type, initialValues: initialValues || undefined, projectSnapshot: project || null });
    try {
      if (scrollRef?.current && typeof scrollRef.current.scrollTo === 'function') {
        scrollRef.current.scrollTo({ y: 0, animated: false });
      }
    } catch(_e) {}
  }, [project]);
  const closeInlineControl = useCallback(() => setInlineControl(null), []);

  const onInlineLockChange = route?.params?.onInlineLockChange;
  const onInlineViewChange = route?.params?.onInlineViewChange;
  const inlineControlType = inlineControl?.type;

  // Inform parent (HomeScreen) when an inline FORM is open on web.
  // This is used to lock the project tree so the user can't switch projects mid-control.
  useEffect(() => {
    try {
      const isWeb = Platform.OS === 'web';
      const isInlineFormOpen = isWeb && !!(inlineControlType && inlineControlType !== 'ControlDetails');
      const cb = onInlineLockChange;
      // Backwards-compatible: allow both prop injection patterns
      // 1) route.params.onInlineLockChange (if parent can't pass real props)
      if (typeof cb === 'function') cb(isInlineFormOpen);
    } catch(_e) {}
  }, [inlineControlType, onInlineLockChange]);

  // Inform parent (HomeScreen) about which inline view is active (breadcrumb leaf).
  useEffect(() => {
    try {
      if (Platform.OS !== 'web') return;
      const cb = onInlineViewChange;
      if (typeof cb !== 'function') return;

      if (!inlineControlType) {
        cb(null);
        return;
      }

      const explicitType = String(inlineControl?.type || '').trim();
      const detailsType = String(inlineControl?.initialValues?.control?.type || '').trim();
      const label = (explicitType === 'ControlDetails' ? detailsType : explicitType) || explicitType;
      cb({ label });
    } catch (_e) {}
  }, [inlineControlType, onInlineViewChange]);

  // When HomeScreen passes a selectedAction (e.g. open a draft from the dashboard),
  // process it once and open the corresponding inline control.
  const lastProcessedActionIdRef = useRef('');
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = selectedAction && selectedAction.id ? String(selectedAction.id) : '';
    if (!id) return;
    if (lastProcessedActionIdRef.current === id) return;
    lastProcessedActionIdRef.current = id;
    try {
      if (selectedAction.kind === 'closeInline') {
        closeInlineControl();
        return;
      }
      if (selectedAction.kind === 'openDraft' && selectedAction.type) {
        openInlineControl(selectedAction.type, selectedAction.initialValues || undefined);
      }
      if (selectedAction.kind === 'openControlDetails' && selectedAction.control) {
        try { openInlineControl('ControlDetails', { control: selectedAction.control }); } catch(_e) {}
      }
      // Överblick för eftermarknad: inget att göra här, hanteras i render
    } catch(_e) {}
  }, [openInlineControl, closeInlineControl, selectedAction]);
  const [adminPickerVisible, setAdminPickerVisible] = useState(false);
  const [companyAdmins, setCompanyAdmins] = useState([]);
  const [loadingCompanyAdmins, setLoadingCompanyAdmins] = useState(false);
  const [companyAdminsError, setCompanyAdminsError] = useState(null);
  
  // States for editing project info modal
  const [editingInfo, setEditingInfo] = useState(false);
  const [editableProject, setEditableProject] = useState(() => normalizeProject(project));
  const [originalProjectId, setOriginalProjectId] = useState(project?.id || null);
  const [savingProjectInfo, setSavingProjectInfo] = useState(false);
  const [saveProjectInfoError, setSaveProjectInfoError] = useState(null);
  
  // States for participants (deltagare)
  const [editProjectParticipants, setEditProjectParticipants] = useState([]);
  const [editProjectParticipantsSearch, setEditProjectParticipantsSearch] = useState('');
  const [companyMembers, setCompanyMembers] = useState([]);
  const [loadingCompanyMembers, setLoadingCompanyMembers] = useState(false);
  const [companyMembersPermissionDenied, setCompanyMembersPermissionDenied] = useState(false);
  const [responsibleDropdownOpen, setResponsibleDropdownOpen] = useState(false);
  const responsibleDropdownRef = useRef(null);
  const [focusedInput, setFocusedInput] = useState(null);
  const [participantsDropdownOpen, setParticipantsDropdownOpen] = useState(false);
  const participantsDropdownRef = useRef(null);

  // Load company admins (for responsible dropdown) - fetch both admin and superadmin
  useEffect(() => {
    let cancelled = false;
    const loadAdmins = async () => {
      if (!editingInfo && !responsibleDropdownOpen) return;
      if (!companyId) {
        setCompanyAdmins([]);
        setCompanyAdminsError('Saknar företag (companyId).');
        return;
      }

      setLoadingCompanyAdmins(true);
      setCompanyAdminsError(null);
      try {
        // Fetch both admin and superadmin users for responsible person dropdown
        const [admins, superadmins] = await Promise.all([
          fetchCompanyMembers(companyId, { role: 'admin' }),
          fetchCompanyMembers(companyId, { role: 'superadmin' })
        ]);
        // Combine and deduplicate by id
        const allAdmins = [...(Array.isArray(admins) ? admins : []), ...(Array.isArray(superadmins) ? superadmins : [])];
        const uniqueAdmins = allAdmins.filter((m, idx, arr) => arr.findIndex(x => x.id === m.id) === idx);
        if (!cancelled) setCompanyAdmins(uniqueAdmins);
      } catch(e) {
        if (!cancelled) {
          setCompanyAdmins([]);
          const msg = e?.code === 'permission-denied'
            ? 'Behörighet saknas för att läsa admins.'
            : 'Kunde inte ladda admins.';
          setCompanyAdminsError(msg);
        }
      } finally {
        if (!cancelled) setLoadingCompanyAdmins(false);
      }
    };

    loadAdmins();
    return () => {
      cancelled = true;
    };
  }, [editingInfo, responsibleDropdownOpen, companyId]);

  // Load all company members (for participants dropdown)
  useEffect(() => {
    let cancelled = false;
    const loadMembers = async () => {
      if (!editingInfo) return;
      if (!companyId) {
        setCompanyMembers([]);
        setCompanyMembersPermissionDenied(false);
        return;
      }

      setLoadingCompanyMembers(true);
      setCompanyMembersPermissionDenied(false);
      try {
        // Fetch ALL members (no role filter) for participants
        const allMembers = await fetchCompanyMembers(companyId);
        if (!cancelled) setCompanyMembers(Array.isArray(allMembers) ? allMembers : []);
      } catch(e) {
        if (!cancelled) {
          const msg = String(e?.message || e || '').toLowerCase();
          if (e?.code === 'permission-denied' || msg.includes('permission')) {
            setCompanyMembersPermissionDenied(true);
          }
          setCompanyMembers([]);
        }
      } finally {
        if (!cancelled) setLoadingCompanyMembers(false);
      }
    };

    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [editingInfo, companyId]);

  // Initialize participants from editableProject when modal opens or overblick is shown
  useEffect(() => {
    const shouldLoadParticipants = editingInfo || (selectedAction?.kind === 'overblick');
    if (shouldLoadParticipants && editableProject?.participants) {
      const participants = Array.isArray(editableProject.participants) 
        ? editableProject.participants.map(p => ({
            uid: p.uid || p.id,
            displayName: p.displayName || p.name || null,
            email: p.email || null,
            role: p.role || null,
          }))
        : [];
      setEditProjectParticipants(participants);
    } else if (!shouldLoadParticipants) {
      setEditProjectParticipants([]);
      setEditProjectParticipantsSearch('');
    }
  }, [editingInfo, editableProject?.participants, selectedAction?.kind]);

  // Handle click outside for responsible and participants dropdowns (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    
    const handleClickOutside = (e) => {
      if (responsibleDropdownRef.current && !responsibleDropdownRef.current.contains(e.target)) {
        setResponsibleDropdownOpen(false);
      }
      if (participantsDropdownRef.current && !participantsDropdownRef.current.contains(e.target)) {
        setParticipantsDropdownOpen(false);
      }
    };

    if (responsibleDropdownOpen || participantsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [responsibleDropdownOpen, participantsDropdownOpen]);
  const hasValidProject = !!(project && typeof project === 'object' && project.id);
  const [controls, setControls] = useState([]);
  // Sökfält för kontroller
  const [searchText, setSearchText] = useState('');

  // Ladda både utkast (pågående) och slutförda kontroller för projektet
  const loadControls = useCallback(async () => {
    if (!project?.id) return;
    let allControls = [];
    // Hämta utkast (pågående)
    try {
      const draftsRaw = await AsyncStorage.getItem('draft_controls');
      if (draftsRaw) {
        const drafts = JSON.parse(draftsRaw);
        drafts.filter(d => d.project?.id === project.id).forEach(draft => {
          allControls.push({ ...draft, isDraft: true });
        });
      }
    } catch {}
    // Hämta slutförda
    try {
      const completedRaw = await AsyncStorage.getItem('completed_controls');
      if (completedRaw) {
        const completed = JSON.parse(completedRaw);
        completed.filter(c => c.project?.id === project.id).forEach(ctrl => {
          allControls.push({ ...ctrl, isDraft: false });
        });
      }
    } catch {}
    // Try fetching from Firestore as well (merge remote completed controls)
    try {
      const remote = await fetchControlsForProject(project.id, companyId);
      if (Array.isArray(remote) && remote.length > 0) {
        remote.forEach(r => {
          // avoid duplicates if already in allControls by id
          if (!allControls.find(c => c.id && r.id && c.id === r.id)) {
            allControls.push(Object.assign({}, r, { isDraft: false }));
          }
        });
      }
    } catch(_e) { /* ignore Firestore errors - we already have local fallback */ }

    // Fetch remote drafts too so a draft created in app can be finished on web
    try {
      const remoteDrafts = await fetchDraftControlsForProject(project.id, companyId);
      if (Array.isArray(remoteDrafts) && remoteDrafts.length > 0) {
        remoteDrafts.forEach(r => {
          if (!allControls.find(c => c.id && r.id && c.id === r.id)) {
            allControls.push(Object.assign({}, r, { isDraft: true }));
          }
        });
      }
    } catch(_e) { /* ignore */ }
    // Sort controls by date (prefer date || savedAt || createdAt) descending
    allControls.sort((a,b) => {
      const ta = new Date(a.date || a.savedAt || a.createdAt || 0).getTime() || 0;
      const tb = new Date(b.date || b.savedAt || b.createdAt || 0).getTime() || 0;
      return tb - ta;
    });
    setControls(allControls);
  }, [project?.id, companyId]);

  // Web: allow parent (HomeScreen header) to force-refresh the list.
  useEffect(() => {
    if (refreshNonce == null) return;
    loadControls();
  }, [refreshNonce, loadControls]);

  // Ladda kontroller när sidan visas (fokus)
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadControls();
    });
    loadControls();
    return unsubscribe;
  }, [navigation, loadControls]);

  // Update editableProject when parent passes a new project (e.g., selecting another project inline)
  React.useEffect(() => {
    setEditableProject(normalizeProject(project));
    setOriginalProjectId(project?.id || null);
  }, [project]);
  const [showForm, setShowForm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [undoState, setUndoState] = useState({ visible: false, item: null, index: -1 });
  const [companyLogoUri] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [skyddsrondWeeksPickerVisible, setSkyddsrondWeeksPickerVisible] = useState(false);
  const [projectInfoExpanded, setProjectInfoExpanded] = useState(false);
  const projectInfoSpin = useRef(new Animated.Value(0)).current;

  const toggleProjectInfo = () => {
    const next = !projectInfoExpanded;
    setProjectInfoExpanded(next);
    try {
      Animated.timing(projectInfoSpin, {
        toValue: next ? 1 : 0,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: (Platform && Platform.OS === 'web') ? false : true,
      }).start();
    } catch (_e) {}
  };

  const projectInfoRotate = projectInfoSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const skyddsrondInfo = React.useMemo(() => {
    const enabled = editableProject?.skyddsrondEnabled !== false;
    const intervalWeeksRaw = Number(editableProject?.skyddsrondIntervalWeeks);
    const intervalDaysRaw = Number(editableProject?.skyddsrondIntervalDays);
    const intervalDays = (Number.isFinite(intervalWeeksRaw) && intervalWeeksRaw > 0)
      ? (intervalWeeksRaw * 7)
      : (Number.isFinite(intervalDaysRaw) && intervalDaysRaw > 0 ? intervalDaysRaw : 14);
    const intervalWeeks = Math.max(1, Math.min(4, Math.round(intervalDays / 7) || 2));

    const MS_DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const toMs = (v) => {
      try {
        if (!v) return 0;
        if (typeof v === 'number') return v;
        const t = new Date(v).getTime();
        return Number.isFinite(t) ? t : 0;
      } catch(_e) {
        return 0;
      }
    };

    let lastMs = 0;
    try {
      (controls || []).forEach((c) => {
        if (!c || c.isDraft) return;
        if (c.type !== 'Skyddsrond') return;
        const ts = toMs(c.date || c.savedAt || c.updatedAt || c.createdAt || null);
        if (ts > lastMs) lastMs = ts;
      });
    } catch(_e) {}

    const createdMs = toMs(editableProject?.createdAt || null);
    const firstDueMs = toMs(editableProject?.skyddsrondFirstDueDate || null);
    const baselineMs = lastMs || createdMs || now;
    const nextDueMs = lastMs
      ? (baselineMs + intervalDays * MS_DAY)
      : (firstDueMs || (baselineMs + intervalDays * MS_DAY));

    const overdue = now > nextDueMs;
    const daysUntil = Math.ceil((nextDueMs - now) / MS_DAY);
    const soon = !overdue && Number.isFinite(daysUntil) && daysUntil <= 3;

    const fmt = (ms) => {
      try {
        if (!ms) return '—';
        return new Date(ms).toLocaleDateString('sv-SE');
      } catch(_e) {
        return '—';
      }
    };

    if (!enabled) {
      return {
        enabled: false,
        intervalWeeks,
        intervalDays,
        lastLabel: lastMs ? fmt(lastMs) : 'Ingen registrerad',
        nextLabel: fmt(nextDueMs),
        overdue: false,
        soon: false,
      };
    }

    return {
      enabled: true,
      intervalWeeks,
      intervalDays,
      lastLabel: lastMs ? fmt(lastMs) : 'Ingen registrerad',
      nextLabel: fmt(nextDueMs),
      overdue,
      soon,
    };
  }, [controls, editableProject?.createdAt, editableProject?.skyddsrondEnabled, editableProject?.skyddsrondIntervalWeeks, editableProject?.skyddsrondIntervalDays, editableProject?.skyddsrondFirstDueDate]);
  // Kontrolltyper: använd samma company-specifika lista som HomeScreen
  const [controlTypes, setControlTypes] = useState(DEFAULT_CONTROL_TYPES);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
        return;
      }
      try {
        const list = await fetchCompanyControlTypes(companyId);
        if (mounted && Array.isArray(list) && list.length > 0) {
          setControlTypes(list);
        } else if (mounted) {
          setControlTypes(DEFAULT_CONTROL_TYPES);
        }
      } catch (_e) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  const controlTypeOptions = React.useMemo(() => {
    const baseList = Array.isArray(controlTypes) && controlTypes.length > 0
      ? controlTypes
      : DEFAULT_CONTROL_TYPES;

    // Om vi har custom-typer (från registret) använder vi den listan rätt upp och ned
    // och bortser från äldre "enabledControlTypes" i companyProfile.
    const hasCustomTypes = baseList.some(ct => ct && ct.builtin === false);

    let visible = baseList.filter(ct => ct && ct.hidden !== true);

    const enabled = companyProfile?.enabledControlTypes;
    if (!hasCustomTypes && Array.isArray(enabled) && enabled.length > 0) {
      const enabledSet = new Set(enabled.map(v => String(v || '').trim()).filter(Boolean));
      visible = visible.filter((ct) => {
        const name = String(ct.name || '').trim();
        const key = String(ct.key || '').trim();
        if (!enabledSet.size) return true;
        return (name && enabledSet.has(name)) || (key && enabledSet.has(key));
      });
    }

    return visible.map((ct) => ({
      type: ct.name || ct.key || '',
      key: ct.key || '',
      icon: ct.icon || 'document-text-outline',
      color: ct.color || '#455A64',
    })).filter(o => o.type);
  }, [controlTypes, companyProfile]);
  const [templates, setTemplates] = useState([]);
  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);
  const [templatePickerLabel, setTemplatePickerLabel] = useState('');
  const [templatePickerItems, setTemplatePickerItems] = useState([]);
  const [templatePickerSearch, setTemplatePickerSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!companyId) {
          if (!cancelled) setTemplates([]);
          return;
        }
        const items = await fetchCompanyMallar(companyId).catch(() => []);
        if (cancelled) return;
        const list = Array.isArray(items) ? items : [];
        // Filtrera bort mallar utan kontrolltyp; sortering sker redan i fetchCompanyMallar
        const active = list.filter(tpl => String(tpl?.controlType || '').trim());
        setTemplates(active);
      } catch (_e) {
        if (!cancelled) setTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const openTemplatePicker = (label, items) => {
    setTemplatePickerLabel(label || '');
    setTemplatePickerItems(Array.isArray(items) ? items : []);
    setTemplatePickerSearch('');
    setTemplatePickerVisible(true);
  };

  const handleStartControl = async (keyOrName, labelOverride) => {
    const raw = String(keyOrName || '').trim();
    const v = raw.toLowerCase();
    const label = labelOverride || raw;

    // Native: om det finns mallar för denna kontrolltyp, använd TemplateControlScreen
    if (Platform.OS !== 'web') {
      const relevantTemplates = (templates || []).filter((tpl) => {
        const ct = String(tpl?.controlType || '').trim();
        if (!ct) return false;
        return ct === label;
      });

      if (relevantTemplates.length === 1) {
        const tpl = relevantTemplates[0];
        navigation.navigate('TemplateControlScreen', {
          project,
          controlType: label,
          templateId: tpl.id,
          template: tpl,
          companyId,
        });
        return;
      }

      if (relevantTemplates.length > 1) {
        openTemplatePicker(label, relevantTemplates);
        return;
      }
    }

    switch (v) {
      case 'arbetsberedning':
      case 'riskbedömning':
      case 'riskbedomning':
      case 'fuktmätning':
      case 'fuktmatning':
      case 'egenkontroll':
      case 'mottagningskontroll':
      case 'skyddsrond':
        // Alla KMA-kontroller navigerar till KMAScreen
        if (Platform.OS === 'web') {
          openInlineControl(v === 'riskbedomning' ? 'Riskbedömning' : (v.charAt(0).toUpperCase() + v.slice(1)));
        } else {
          navigation.navigate('KMAScreen', { project, controlType: v });
        }
        break;
      default:
        {
            const meta = (controlTypeOptions || []).find(o => (o.key && o.key.toLowerCase() === v) || o.type === label) || null;
            const iconName = meta && meta.icon ? meta.icon : undefined;
            const iconColor = meta && meta.color ? meta.color : undefined;
            if (Platform.OS === 'web') {
              openInlineControl(label);
            } else {
              navigation.navigate('ControlForm', {
                project,
                controlType: label,
                controlIcon: iconName,
                controlColor: iconColor,
              });
            }
        }
    }
  };
  const [exportFilter, setExportFilter] = useState('Alla');
  const [, setSelectedControl] = useState(null);
  const [, setShowControlOptions] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ visible: false, control: null });
  const undoTimerRef = useRef(null);
  const [quickControlSlots, setQuickControlSlots] = useState(['', '', '', '']);
  const [quickSlotConfigIndex, setQuickSlotConfigIndex] = useState(null);
  const [showQuickSlotModal, setShowQuickSlotModal] = useState(false);
  const quickSlotsLoadedRef = useRef(false);
  // ...existing code...

  // Prefetch company profile for PDF branding (logo/name) without affecting UI
  React.useEffect(() => {
    let active = true;
    if (!companyId) {
      setCompanyProfile(null);
      return () => { active = false; };
    }
    fetchCompanyProfile(companyId)
      .then((p) => { if (active) setCompanyProfile(p || null); })
      .catch((e) => { /* ignore */ });
    return () => { active = false; };
  }, [companyId]);

  // Load and persist per-user quick control button choices
  const quickSlotsStorageKey = React.useMemo(() => {
    const userKey = (initialCreator && (initialCreator.uid || initialCreator.id || initialCreator.email))
      ? String(initialCreator.uid || initialCreator.id || initialCreator.email)
      : 'local';
    const companyKey = companyId ? String(companyId) : 'global';
    return `quick_control_slots_${companyKey}_${userKey}`;
  }, [companyId, initialCreator]);

  React.useEffect(() => {
    if (!controlTypeOptions || controlTypeOptions.length === 0) return;
    if (quickSlotsLoadedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(quickSlotsStorageKey);
        if (cancelled) return;
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) {
            setQuickControlSlots([
              String(arr[0] || ''),
              String(arr[1] || ''),
              String(arr[2] || ''),
              String(arr[3] || ''),
            ]);
            quickSlotsLoadedRef.current = true;
            return;
          }
        }
      } catch (_e) {}
      // No saved prefs: default to first four visible control types (store key when möjligt)
      const defaults = (controlTypeOptions || []).slice(0, 4).map(o => o.key || o.type);
      setQuickControlSlots([
        defaults[0] || '',
        defaults[1] || '',
        defaults[2] || '',
        defaults[3] || '',
      ]);
      quickSlotsLoadedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [controlTypeOptions, quickSlotsStorageKey]);

  const persistQuickSlots = React.useCallback(async (slots) => {
    try {
      await AsyncStorage.setItem(quickSlotsStorageKey, JSON.stringify(slots));
    } catch (_e) {}
  }, [quickSlotsStorageKey]);

  const openQuickSlotConfig = (index) => {
    setQuickSlotConfigIndex(index);
    setShowQuickSlotModal(true);
  };

  // Handler for long-press on a control
  const handleControlLongPress = (control) => {
    setSelectedControl(control);
    setShowControlOptions(true);
  };

  // Handler for deleting selected control
  const handleDeleteSelectedControl = async () => {
    if (!deleteConfirm.control) return;
    await actuallyDeleteControl(deleteConfirm.control);
    setDeleteConfirm({ visible: false, control: null });
    setShowControlOptions(false);
    setSelectedControl(null);
    loadControls && loadControls();
  };

  // Delete logic for a control (draft or completed)
  const actuallyDeleteControl = async (control) => {
    if (!control) return;
    if (control.isDraft) {
      // Remove from draft_controls
      const draftsRaw = await AsyncStorage.getItem('draft_controls');
      let drafts = draftsRaw ? JSON.parse(draftsRaw) : [];
      drafts = drafts.filter(
        c => c.id !== control.id
      );
      await AsyncStorage.setItem('draft_controls', JSON.stringify(drafts));

      // Best-effort: delete remote draft too
      try { await deleteDraftControlFromFirestore(control.id, companyId); } catch(_e) {}
    } else {
      // Remove from completed_controls
      const completedRaw = await AsyncStorage.getItem('completed_controls');
      let completed = completedRaw ? JSON.parse(completedRaw) : [];
      completed = completed.filter(
        c => c.id !== control.id
      );
      await AsyncStorage.setItem('completed_controls', JSON.stringify(completed));

      // Best-effort: delete remote control too
      try { await deleteControlFromFirestore(control.id, companyId); } catch(_e) {}
    }
  };

  // Create a new draft control locally and refresh list
  const handleAddControl = async () => {
    try {
      if (!newControl || !newControl.type) {
        setNotice({ visible: true, text: 'Välj en kontrolltyp' });
        setTimeout(() => setNotice({ visible: false, text: '' }), 3000);
        return;
      }
      const id = uuidv4();
      const draft = normalizeControl({
        ...newControl,
        id,
        project,
        type: newControl.type,
        status: 'UTKAST',
        savedAt: new Date().toISOString(),
        isDraft: true,
      });
      await persistDraftObject(draft);
      setShowForm(false);
      setNewControl({ type: '', date: '', description: '', byggdel: '' });
      try { loadControls && loadControls(); } catch (_e) {}
      setNotice({ visible: true, text: 'Utkast sparat' });
      setTimeout(() => setNotice({ visible: false, text: '' }), 2500);
    } catch (e) {
      console.warn('[ProjectDetails] handleAddControl failed', e);
      setNotice({ visible: true, text: 'Kunde inte skapa kontroll' });
      setTimeout(() => setNotice({ visible: false, text: '' }), 3500);
    }
  };

  // Undo a recently deleted control (restore into local storage)
  const handleUndo = async () => {
    try {
      if (!undoState || !undoState.item) return;
      const item = undoState.item;
      if (item.isDraft) {
        const raw = await AsyncStorage.getItem('draft_controls');
        const arr = raw ? (JSON.parse(raw) || []) : [];
        const idx = (typeof undoState.index === 'number' && undoState.index >= 0) ? undoState.index : arr.length;
        arr.splice(idx, 0, item);
        await AsyncStorage.setItem('draft_controls', JSON.stringify(arr));
      } else {
        const raw = await AsyncStorage.getItem('completed_controls');
        const arr = raw ? (JSON.parse(raw) || []) : [];
        const idx = (typeof undoState.index === 'number' && undoState.index >= 0) ? undoState.index : arr.length;
        arr.splice(idx, 0, item);
        await AsyncStorage.setItem('completed_controls', JSON.stringify(arr));
      }
      setUndoState({ visible: false, item: null, index: -1 });
      if (undoTimerRef.current) {
        try { clearTimeout(undoTimerRef.current); } catch (_e) {}
        undoTimerRef.current = null;
      }
      try { loadControls && loadControls(); } catch (_e) {}
    } catch (e) {
      console.warn('[ProjectDetails] handleUndo failed', e);
    }
  };

  // Huvud-UI return
  if (!hasValidProject) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 18, color: '#D32F2F', textAlign: 'center' }}>
          Kunde inte läsa projektdata.
        </Text>
        <Text style={{ fontSize: 14, color: '#888', marginTop: 8, textAlign: 'center' }}>
          Projektet är inte korrekt laddat eller saknar ID.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, padding: 12, backgroundColor: '#1976D2', borderRadius: 8 }}
          onPress={() => {
            if (typeof inlineClose === 'function') inlineClose();
            else navigation.goBack();
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Tillbaka</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Web: keep header/tree and render control forms inside the right pane
  if (Platform.OS === 'web' && inlineControl && inlineControl.type) {
    return (
      <ProjectDetailsInlineControl
        inlineControl={inlineControl}
        project={project}
        companyId={companyId}
        closeInlineControl={closeInlineControl}
        loadControls={loadControls}
      />
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, Platform.OS === 'web' ? { backgroundColor: '#F7FAFC' } : null]}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER,
        flexGrow: 1,
        minHeight: 0,
      }}
    >
      {/* Rubrik för projektinfo (med tillbaka-pil i appen och redigera-knapp till höger) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              onPress={() => {
                if (inlineClose) {
                  inlineClose();
                } else {
                  try { navigation.goBack(); } catch (_e) {}
                }
              }}
              style={{ padding: 6, marginRight: 8 }}
              accessibilityLabel="Tillbaka"
            >
              <Ionicons name="chevron-back" size={20} color="#1976D2" />
            </TouchableOpacity>
          )}
          {Platform.OS !== 'web' ? (
            <>
              <Ionicons name="document-text-outline" size={20} color="#1976D2" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">Projektinformation</Text>
            </>
          ) : null}
        </View>
        {Platform.OS === 'web' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', gap: 12 }}>
            <TouchableOpacity
              onPress={() => setEditingInfo(true)}
              accessibilityLabel="Ändra projektinfo"
              style={{ padding: 6, marginRight: 8 }}
            >
              <Ionicons name="create-outline" size={22} color="#1976D2" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setEditingInfo(true)}
            accessibilityLabel="Ändra projektinfo"
            style={{ padding: 6 }}
          >
            <Ionicons name="create-outline" size={22} color="#1976D2" />
          </TouchableOpacity>
        )}
      </View>
      {/* Project Header - Show project name and number prominently */}
      <View style={{ marginBottom: 16, padding: 16, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: editableProject?.status === 'completed' ? '#222' : '#43A047',
            marginRight: 12,
            borderWidth: 2,
            borderColor: '#bbb',
          }} />
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#222', marginRight: 12 }}>
            {editableProject?.projectNumber || project?.projectNumber || project?.number || project?.id || ''}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#222', flex: 1 }} numberOfLines={1} ellipsizeMode="tail">
            {editableProject?.projectName || project?.projectName || project?.name || project?.fullName || 'Projekt'}
          </Text>
        </View>
        {editableProject?.phase && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 14, color: '#666' }}>
              Fas: {getProjectPhase(editableProject).name}
            </Text>
          </View>
        )}
      </View>

      {/* Internal Navigation */}
      <ProjectInternalNavigation
        activeSection={activeSection}
        onSelectSection={(id) => setActiveSection(normalizeInternalSectionId(id))}
        project={editableProject || project}
      />

      {/* Section Content */}
      <ProjectDetailsSectionDocuments
        activeSection={activeSection}
        project={editableProject || project}
        companyId={companyId}
      />

      {/* Overview Section - Show project info */}
      {activeSection === 'overview' && (
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#222' }}>
            Projektinformation
          </Text>
          <ProjectDetailsOverviewCard
            companyLogoUri={companyLogoUri}
            toggleProjectInfo={toggleProjectInfo}
            projectInfoExpanded={projectInfoExpanded}
            projectInfoRotate={projectInfoRotate}
            editableProject={editableProject}
            formatPersonName={formatPersonName}
            skyddsrondInfo={skyddsrondInfo}
          />
        </View>
      )}

      {/* Modal för ändra projektinfo - uppdaterad layout liknande Skapa nytt projekt */}
      <ProjectDetailsEditModal
        editingInfo={editingInfo}
        setEditingInfo={setEditingInfo}
        windowWidth={windowWidth}
        editableProject={editableProject}
        setEditableProject={setEditableProject}
        setFocusedInput={setFocusedInput}
        focusedInput={focusedInput}
        saveProjectInfoError={saveProjectInfoError}
        setSaveProjectInfoError={setSaveProjectInfoError}
        canEditCreated={canEditCreated}
        setCanEditCreated={setCanEditCreated}
        editProjectParticipants={editProjectParticipants}
        setEditProjectParticipants={setEditProjectParticipants}
        editProjectParticipantsSearch={editProjectParticipantsSearch}
        setEditProjectParticipantsSearch={setEditProjectParticipantsSearch}
        companyMembers={companyMembers}
        loadingCompanyMembers={loadingCompanyMembers}
        companyMembersPermissionDenied={companyMembersPermissionDenied}
        companyAdmins={companyAdmins}
        loadingCompanyAdmins={loadingCompanyAdmins}
        companyAdminsError={companyAdminsError}
        responsibleDropdownOpen={responsibleDropdownOpen}
        setResponsibleDropdownOpen={setResponsibleDropdownOpen}
        participantsDropdownOpen={participantsDropdownOpen}
        setParticipantsDropdownOpen={setParticipantsDropdownOpen}
        responsibleDropdownRef={responsibleDropdownRef}
        participantsDropdownRef={participantsDropdownRef}
        adminPickerVisible={adminPickerVisible}
        setAdminPickerVisible={setAdminPickerVisible}
        skyddsrondWeeksPickerVisible={skyddsrondWeeksPickerVisible}
        setSkyddsrondWeeksPickerVisible={setSkyddsrondWeeksPickerVisible}
        savingProjectInfo={savingProjectInfo}
        setSavingProjectInfo={setSavingProjectInfo}
        project={project}
        setProject={setProject}
        originalProjectId={originalProjectId}
        navigation={navigation}
        companyId={companyId}
        controls={controls}
        setShowDeleteModal={setShowDeleteModal}
        setShowDeleteWarning={setShowDeleteWarning}
        formatPersonName={formatPersonName}
        isValidIsoDateYmd={isValidIsoDateYmd}
        hasDuplicateProjectNumber={hasDuplicateProjectNumber}
        patchCompanyProject={patchCompanyProject}
        fetchCompanyProject={fetchCompanyProject}
        normalizeProject={normalizeProject}
        emitProjectUpdated={emitProjectUpdated}
        updateSharePointProjectPropertiesFromFirestoreProject={updateSharePointProjectPropertiesFromFirestoreProject}
        enqueueFsExcelSync={enqueueFsExcelSync}
      />
      
      <ProjectDetailsOverviewPanel
        selectedAction={selectedAction}
        editableProject={editableProject}
        setEditableProject={setEditableProject}
        editProjectParticipants={editProjectParticipants}
        navigation={navigation}
        originalProjectId={originalProjectId}
        emitProjectUpdated={emitProjectUpdated}
        isValidIsoDateYmd={isValidIsoDateYmd}
        formatPersonName={formatPersonName}
      />
      
      {/* Knapprad med horisontella linjer */}
      {selectedAction?.kind !== 'overblick' && (
        <View style={{ marginBottom: 12 }}>
          <View style={{ height: 1, backgroundColor: '#e0e0e0', marginBottom: 16, marginTop: 8, width: '110%', marginLeft: '-5%' }} />
          {Platform.OS === 'web' ? (
          <>
            <View style={{ marginBottom: 8, alignItems: 'flex-start', paddingHorizontal: 0 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', textAlign: 'left', marginBottom: 12, color: '#263238', letterSpacing: 0.2 }}>Skapa kontroll:</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { type: 'Arbetsberedning', icon: 'construct-outline', color: '#1976D2' },
                { type: 'Egenkontroll', icon: 'checkmark-done-outline', color: '#388E3C' },
                { type: 'Fuktmätning', icon: 'water-outline', color: '#0288D1' },
                { type: 'Mottagningskontroll', icon: 'checkbox-outline', color: '#7B1FA2' },
                { type: 'Riskbedömning', icon: 'warning-outline', color: '#FFD600' },
                { type: 'Skyddsrond', icon: 'shield-half-outline', color: '#388E3C' }
              ].map(({ type, icon, color }) => (
                <TouchableOpacity
                  key={type}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#e0e0e0',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    marginRight: 10,
                    marginBottom: 10,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.06,
                    shadowRadius: 4,
                    elevation: 2,
                    cursor: 'pointer'
                  }}
                  onPress={() => handleStartControl(type)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={icon} size={18} color={color} style={{ marginRight: 10 }} />
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 15 }}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={{ width: '100%' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  shadowColor: '#222',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: 1,
                  minHeight: 40,
                  width: '100%',
                  marginBottom: 8,
                  overflow: 'hidden',
                }}
                activeOpacity={0.85}
                onPress={() => setShowControlTypeModal(true)}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: '#1976D2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                </View>
                <Text style={{ color: '#222', fontWeight: '600', fontSize: 15, letterSpacing: 0.5, zIndex: 1 }}>Skapa ny kontroll</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ marginTop: 10, marginBottom: 4, color: '#555', fontSize: 13, textAlign: 'left' }}>
              Justerbara snabbval – håll in knappen 2 sek för att byta val.
            </Text>
            <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {[0, 1, 2, 3].map((slotIndex) => {
                const slotType = quickControlSlots[slotIndex];
                const meta = (controlTypeOptions || []).find(o => o.key === slotType || o.type === slotType) || (controlTypeOptions || [])[slotIndex] || null;
                const hasType = !!(meta && meta.type);
                const iconName = hasType ? meta.icon : 'add-circle-outline';
                const iconColor = hasType ? meta.color : '#1976D2';
                const label = hasType ? meta.type : 'Välj';
                return (
                  <TouchableOpacity
                    key={String(slotIndex)}
                    style={{
                      flexBasis: '48%',
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#e0e0e0',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.06,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (hasType) handleStartControl(meta.key || meta.type, meta.type);
                      else openQuickSlotConfig(slotIndex);
                    }}
                    onLongPress={() => openQuickSlotConfig(slotIndex)}
                    delayLongPress={1500}
                  >
                    <Ionicons name={iconName} size={18} color={iconColor} style={{ marginRight: 8 }} />
                    <Text style={{ color: '#222', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
        <View style={{ height: 1, backgroundColor: '#e0e0e0', marginTop: 16, width: '110%', marginLeft: '-5%' }} />
      </View>
      )}

      {/* Controls rendering - moved to controls section */}
      {selectedAction?.kind !== 'overblick' && activeSection !== 'controls' && activeSection !== 'overview' && activeSection !== 'documents' && activeSection !== 'kalkyl' && (
        <>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8, minHeight: 32 }}>

      {/* Modal för val av kontrolltyp */}
      <Modal
        visible={showControlTypeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowControlTypeModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, paddingVertical: 20, paddingHorizontal: 20, width: 340, maxWidth: '90%', maxHeight: '60%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
            <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 8, color: '#222', textAlign: 'center', marginTop: 6 }}>
              Välj kontrolltyp
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <ScrollView
                style={{ maxHeight: 320, flex: 1 }}
                showsVerticalScrollIndicator
                onLayout={(e) => {
                  const h = e?.nativeEvent?.layout?.height || 0;
                  setControlTypeScrollMetrics(prev => ({ ...prev, containerHeight: h }));
                }}
                onContentSizeChange={(w, h) => {
                  setControlTypeScrollMetrics(prev => ({ ...prev, contentHeight: h || 0 }));
                }}
                onScroll={(e) => {
                  const y = e?.nativeEvent?.contentOffset?.y || 0;
                  setControlTypeScrollMetrics(prev => ({ ...prev, scrollY: y }));
                }}
                scrollEventThrottle={16}
              >
                {controlTypeOptions.map(({ type, icon, color, key }) => (
                  <TouchableOpacity
                    key={type}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, marginBottom: 8, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' }}
                    onPress={() => {
                      setShowControlTypeModal(false);
                      handleStartControl(key || type, type);
                    }}
                  >
                    <Ionicons name={icon} size={22} color={color} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>{type}</Text>
                  </TouchableOpacity>
                ))}
                {Array.isArray(companyProfile?.enabledControlTypes) && controlTypeOptions.length === 0 ? (
                  <Text style={{ color: '#D32F2F', textAlign: 'center', marginTop: 6, marginBottom: 8 }}>
                    Inga kontrolltyper är aktiverade för företaget.
                  </Text>
                ) : null}
              </ScrollView>
                {controlTypeCanScroll ? (
                <View
                  style={{
                    width: 3,
                    marginLeft: 6,
                    borderRadius: 999,
                    backgroundColor: '#E0E0E0',
                    height: controlTypeScrollMetrics.containerHeight || 0,
                    overflow: 'hidden',
                    alignSelf: 'flex-start',
                    marginTop: 2,
                    pointerEvents: 'none',
                  }}
                >
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      borderRadius: 999,
                      backgroundColor: '#B0B0B0',
                      height: controlTypeThumbHeight,
                      top: controlTypeThumbTop,
                    }}
                  />
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={{ marginTop: 8, alignSelf: 'center' }}
              onPress={() => setShowControlTypeModal(false)}
            >
              <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: välj mall när en kontrolltyp har flera mallar */}
      <Modal
        visible={templatePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTemplatePickerVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, paddingVertical: 20, paddingHorizontal: 20, width: 340, maxWidth: '90%', maxHeight: '60%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#222', textAlign: 'center' }}>
              {templatePickerLabel ? `Välj mall för ${templatePickerLabel}` : 'Välj mall'}
            </Text>
            <TextInput
              placeholder="Sök mall..."
              placeholderTextColor="#999"
              value={templatePickerSearch}
              onChangeText={setTemplatePickerSearch}
              style={{
                marginTop: 8,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: '#e0e0e0',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                fontSize: 14,
                backgroundColor: '#f9f9f9',
              }}
            />
            <ScrollView style={{ maxHeight: 320, marginTop: 4 }}>
              {(() => {
                const all = Array.isArray(templatePickerItems) ? templatePickerItems : [];
                const qRaw = String(templatePickerSearch || '').trim();
                const q = qRaw.toLowerCase();
                const filtered = all.filter((tpl) => {
                  if (!q) return true;
                  const title = String(tpl?.title || '').toLowerCase();
                  return title.includes(q);
                });

                if (!filtered.length) {
                  const hasQuery = !!qRaw;
                  return (
                    <Text style={{ fontSize: 14, color: '#D32F2F', textAlign: 'center', marginTop: 8 }}>
                      {hasQuery
                        ? `Ingen mall hittades för "${qRaw}".`
                        : 'Inga mallar tillgängliga.'}
                    </Text>
                  );
                }

                return filtered.map((tpl) => {
                  const isHidden = !!tpl.hidden;
                  const title = String(tpl?.title || 'Namnlös mall');
                  const versionLabel = (typeof tpl?.version === 'number' || typeof tpl?.version === 'string')
                    ? `v${tpl.version}`
                    : '';
                  return (
                    <TouchableOpacity
                      key={tpl.id || title}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 4,
                        marginBottom: 2,
                      }}
                      onPress={() => {
                        setTemplatePickerVisible(false);
                        if (!tpl) return;
                        navigation.navigate('TemplateControlScreen', {
                          project,
                          controlType: templatePickerLabel || tpl.controlType || 'Kontroll',
                          templateId: tpl.id,
                          template: tpl,
                          companyId,
                        });
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 4,
                          borderBottomWidth: 1,
                          borderBottomColor: '#eee',
                        }}
                      >
                        <Text
                          style={{ fontSize: 15, fontWeight: '600', color: isHidden ? '#9E9E9E' : '#222', flexShrink: 1 }}
                          numberOfLines={1}
                        >
                          {title + (isHidden ? ' (inaktiv)' : '')}
                        </Text>
                        {versionLabel ? (
                          <Text style={{ fontSize: 13, color: '#555', marginLeft: 8 }} numberOfLines={1}>
                            {versionLabel}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
            <TouchableOpacity
              style={{ marginTop: 12, alignSelf: 'center' }}
              onPress={() => setTemplatePickerVisible(false)}
            >
              <Text style={{ color: '#222', fontSize: 16 }}>Stäng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: välj kontrolltyp för snabbknapp */}
      <Modal
        visible={showQuickSlotModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuickSlotModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>
              Välj snabbknapp
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {controlTypeOptions.map(({ type, icon, color, key }) => (
                <TouchableOpacity
                  key={type}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, marginBottom: 6, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' }}
                  onPress={() => {
                    if (quickSlotConfigIndex == null) return;
                    const next = [...quickControlSlots];
                    next[quickSlotConfigIndex] = key || type;
                    setQuickControlSlots(next);
                    persistQuickSlots(next);
                    setShowQuickSlotModal(false);
                  }}
                >
                  <Ionicons name={icon} size={20} color={color} style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 15, color: '#222', fontWeight: '600' }}>{type}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={{ marginTop: 10, alignSelf: 'center' }}
              onPress={() => setShowQuickSlotModal(false)}
            >
              <Text style={{ color: '#222', fontSize: 16 }}>Stäng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

              {/* Modal: Bekräfta radering om inga kontroller */}
              <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
                <View style={styles.centerOverlay}>
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, minWidth: 260, maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 18, color: '#222', textAlign: 'center' }}>Vill du arkivera projektet?</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                        <TouchableOpacity
                          style={{ backgroundColor: '#D32F2F', borderRadius: 8, padding: 12, flex: 1, marginRight: 8, alignItems: 'center', opacity: archivingProject ? 0.7 : 1 }}
                          disabled={archivingProject}
                          onPress={async () => {
                            setShowDeleteModal(false);
                            await handleArchiveProject();
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{archivingProject ? 'Arkiverar…' : 'Arkivera'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, flex: 1, marginLeft: 8, alignItems: 'center' }} onPress={() => setShowDeleteModal(false)}>
                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
              {/* Modal: Extra varning om kontroller finns */}
              <Modal visible={showDeleteWarning} transparent animationType="fade" onRequestClose={() => setShowDeleteWarning(false)}>
                <View style={styles.centerOverlay}>
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, minWidth: 260, maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 18, color: '#D32F2F', textAlign: 'center' }}>Projektet har kontroller kopplade.\nÄr du säker på att du vill arkivera projektet? Det flyttas till arkiv.</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                        <TouchableOpacity
                          style={{ backgroundColor: '#D32F2F', borderRadius: 8, padding: 12, flex: 1, marginRight: 8, alignItems: 'center', opacity: archivingProject ? 0.7 : 1 }}
                          disabled={archivingProject}
                          onPress={async () => {
                            setShowDeleteWarning(false);
                            await handleArchiveProject();
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{archivingProject ? 'Arkiverar…' : 'Arkivera'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, flex: 1, marginLeft: 8, alignItems: 'center' }} onPress={() => setShowDeleteWarning(false)}>
                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
        </View>
        </>
      )}

      {/* Controls Section */}
      {activeSection === 'controls' && (
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#222' }}>
            Kontroller
          </Text>
          {/* Sökfält för kontroller */}
          <View style={{ marginBottom: 10 }}>
            <TextInput
              style={[styles.input, { marginBottom: 0 }]}
              placeholder="Sök kontroller (t.ex. gips, arbetsmoment, leverans...)"
              placeholderTextColor="#888"
              value={searchText}
              onChangeText={setSearchText}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          {(() => {
        const baseControls = Array.isArray(controls) ? controls : [];
        // Filtrera kontroller baserat på söktext
        const lowerSearch = (searchText || '').toLowerCase();
        const filteredControls = !lowerSearch
          ? baseControls
          : baseControls.filter(c => {
              const fields = [c.deliveryDesc, c.materialDesc, c.generalNote, c.description, c.arbetsmoment];
              return fields.some(f => f && String(f).toLowerCase().includes(lowerSearch));
            });
        const grouped = controlTypes
          .map((t) => ({ type: t, items: filteredControls.filter(c => (c.type || '') === t) }))
          .filter(g => g.items.length > 0);

        if (grouped.length === 0) {
          const msg = lowerSearch
            ? 'Inga kontroller matchar sökningen.'
            : 'Inga kontroller utförda än';
          return (
            <Text style={[styles.noControls, { color: '#D32F2F' }]}>{msg}</Text>
          );
        }

        const toggleType = (t) => {
              try { Haptics.selectionAsync(); } catch {}
              setExpandedByType((prev) => ({ ...prev, [t]: !(prev[t] ?? false) }));
            };

            const pluralLabels = {
              Arbetsberedning: 'Arbetsberedningar',
              Egenkontroll: 'Egenkontroller',
              Fuktmätning: 'Fuktmätningar',
              Skyddsrond: 'Skyddsronder',
              Riskbedömning: 'Riskbedömningar',
            };

            // Helper: count open/total deviations in a Skyddsrond.
            // Supports both newer schema (checklist + remediation keyed by point text)
            // and legacy schema (checklistSections + remediation indexed by point index).
            function getSkyddsrondDeviationStats(ctrl) {
              try {
                const sections = Array.isArray(ctrl?.checklist)
                  ? ctrl.checklist
                  : (Array.isArray(ctrl?.checklistSections) ? ctrl.checklistSections : null);
                if (!Array.isArray(sections) || sections.length === 0) return { total: 0, open: 0 };

                let total = 0;
                let open = 0;
                for (const section of sections) {
                  if (!section || !Array.isArray(section.statuses)) continue;
                  const points = Array.isArray(section.points) ? section.points : [];
                  for (let i = 0; i < section.statuses.length; i++) {
                    if (section.statuses[i] !== 'avvikelse') continue;
                    total += 1;
                    const pt = points[i];
                    const rem = section.remediation
                      ? ((pt !== undefined && pt !== null) ? section.remediation[pt] : null) || section.remediation[i]
                      : null;
                    if (!rem) open += 1;
                  }
                }
                return { total, open };
              } catch(_e) {
                return { total: 0, open: 0 };
              }
            }

        // For group header: are ALL Skyddsrond controls handled?
        return (
          <View>
            {grouped.map(({ type, items }) => {
              const t = type;
              const typeMeta = (controlTypeOptions || []).find(o => o.type === t) || null;
              let anyOpenDeviation = false;
              if (t === 'Skyddsrond') {
                const stats = (items || []).map(ctrl => getSkyddsrondDeviationStats(ctrl));
                anyOpenDeviation = stats.some(s => s.open > 0);
              }
              const expanded = expandedByType[t] ?? false;
              return (
                <View key={t} style={styles.groupContainer}>
                  <TouchableOpacity style={styles.groupHeader} onPress={() => toggleType(t)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color="#263238" />
                      {typeMeta ? (
                        <Ionicons
                          name={typeMeta.icon}
                          size={18}
                          color={typeMeta.color}
                          style={{ marginLeft: 8 }}
                          accessibilityLabel={`${t} ikon`}
                        />
                      ) : null}
                      <Text style={styles.groupTitle} numberOfLines={1} ellipsizeMode="tail">{pluralLabels[t] || t}</Text>
                    </View>

                    {t === 'Skyddsrond' && anyOpenDeviation && (
                      <TouchableOpacity
                        onPress={(e) => {
                          try { e && e.stopPropagation && e.stopPropagation(); } catch(_e) {}
                          // Expand the group so the problematic rond becomes visible (and highlighted).
                          setExpandedByType((prev) => ({ ...prev, [t]: true }));
                        }}
                        style={{ marginRight: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FFD600' }}
                        activeOpacity={0.85}
                        accessibilityLabel="Åtgärda"
                      >
                        <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>Åtgärda</Text>
                      </TouchableOpacity>
                    )}
                    <View style={styles.groupBadge}><Text style={styles.groupBadgeText}>{items.length}</Text></View>
                  </TouchableOpacity>
                  {expanded ? (
                    items
                      .slice()
                      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                      .map((item, idx) => {
                        // ...existerande rendering av kontrollkortet...
                        const isWeb = Platform.OS === 'web';
                        const leadingIconSize = isWeb ? 20 : 22;
                        const leadingIconMarginRight = isWeb ? 6 : 8;
                        const trailingIconPadding = isWeb ? 4 : 6;
                        const trailingIconMarginLeft = isWeb ? 6 : 8;
                        let subtitle = null;
                        let parsedDate = '';
                        let label = '';
                        if (item.type === 'Skyddsrond' || item.type === 'Riskbedömning') {
                          let dateStr = '';
                          if (item.date && item.date.length >= 10) {
                            const d = new Date(item.date);
                            if (!isNaN(d)) dateStr = d.toISOString().slice(0, 10);
                          }
                          if (!dateStr) dateStr = '(okänt datum)';
                          const wy = getWeekAndYear(item.date || item.savedAt || item.createdAt || dateStr);
                          const weekStr = wy && wy.week ? (wy.week < 10 ? '0' + wy.week : String(wy.week)) : '';
                          label = (weekStr ? `V.${weekStr} - ` : '') + dateStr;
                          subtitle = (item.deliveryDesc && String(item.deliveryDesc).trim())
                            ? String(item.deliveryDesc).trim()
                            : (item.materialDesc && String(item.materialDesc).trim()) ? String(item.materialDesc).trim()
                            : (item.generalNote && String(item.generalNote).trim()) ? String(item.generalNote).trim()
                            : (item.description && String(item.description).trim()) ? String(item.description).trim()
                            : null;
                        } else if (item.type === 'Mottagningskontroll') {
                          const tryParse = (v) => {
                            if (!v) return null;
                            try {
                              const d = new Date(v);
                              if (!isNaN(d)) return d.toLocaleDateString('sv-SE');
                            } catch(_e) {}
                            return null;
                          };
                          parsedDate = tryParse(item.date) || tryParse(item.dateValue) || tryParse(item.savedAt) || tryParse(item.createdAt) || tryParse(item.created) || '';
                          if (!parsedDate && item.date) parsedDate = item.date;
                          const dateLabel = parsedDate || '(okänt datum)';
                          const wy = getWeekAndYear(parsedDate || item.date || item.savedAt || item.createdAt);
                          const weekStr = wy && wy.week ? (wy.week < 10 ? '0' + wy.week : String(wy.week)) : '';
                          const header = weekStr ? `V.${weekStr} - ${dateLabel}` : dateLabel;
                          label = header;
                          subtitle = (item.deliveryDesc && String(item.deliveryDesc).trim())
                            ? String(item.deliveryDesc).trim()
                            : (item.materialDesc && String(item.materialDesc).trim()) ? String(item.materialDesc).trim()
                            : (item.generalNote && String(item.generalNote).trim()) ? String(item.generalNote).trim()
                            : (item.description && String(item.description).trim()) ? String(item.description).trim()
                            : null;
                        } else {
                          label = `${item.type}${item.date ? ' ' + item.date : ''}`;
                          if (item.deliveryDesc && String(item.deliveryDesc).trim()) {
                            label = `${label} — ${String(item.deliveryDesc).trim()}`;
                          }
                        }
                        // Skyddsrond deviation status (open deviations => highlight)
                        let hasDeviation = false;
                        let allHandled = false;
                        if (item.type === 'Skyddsrond') {
                          const stats = getSkyddsrondDeviationStats(item);
                          allHandled = stats.total > 0 && stats.open === 0;
                          hasDeviation = stats.open > 0;
                        }
                        return (
                          <View key={`${item.id || 'noid'}-${item.date || 'nodate'}-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                            <TouchableOpacity
                              style={[
                                styles.controlCard,
                                (Platform.OS === 'web' ? styles.controlCardWeb : null),
                                (item.isDraft
                                  ? { backgroundColor: '#fff', borderColor: '#222' }
                                  : item.type === 'Skyddsrond' && hasDeviation
                                    ? { backgroundColor: '#FFD600', borderColor: '#D32F2F', borderWidth: 2 }
                                    : item.type === 'Skyddsrond' && allHandled
                                      ? { backgroundColor: '#fff', borderColor: '#43A047', borderWidth: 2 }
                                      : { backgroundColor: '#fff', borderColor: '#e0e0e0' }
                                )
                              ]}
                              onPress={() => {
                                if (item.isDraft) {
                                  switch (item.type) {
                                    case 'Arbetsberedning':
                                      if (Platform.OS === 'web') openInlineControl('Arbetsberedning', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'arbetsberedning' });
                                      break;
                                    case 'Riskbedömning':
                                      if (Platform.OS === 'web') openInlineControl('Riskbedömning', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'riskbedömning' });
                                      break;
                                    case 'Fuktmätning':
                                      if (Platform.OS === 'web') openInlineControl('Fuktmätning', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'fuktmätning' });
                                      break;
                                    case 'Egenkontroll':
                                      if (Platform.OS === 'web') openInlineControl('Egenkontroll', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'egenkontroll' });
                                      break;
                                    case 'Mottagningskontroll':
                                      if (Platform.OS === 'web') openInlineControl('Mottagningskontroll', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'mottagningskontroll' });
                                      break;
                                    case 'Skyddsrond':
                                      if (Platform.OS === 'web') openInlineControl('Skyddsrond', item);
                                      else navigation.navigate('KMAScreen', { initialValues: item, project, controlType: 'skyddsrond' });
                                      break;
                                    default:
                                      if (Platform.OS === 'web') openInlineControl(item.type, item);
                                      else navigation.navigate('ControlForm', { initialValues: item, project });
                                  }
                                } else {
                                  if (Platform.OS === 'web') {
                                    openInlineControl('ControlDetails', { control: item });
                                  } else {
                                    navigation.navigate('ControlDetails', { control: item, project, companyId });
                                  }
                                }
                              }}
                              onLongPress={item.isDraft ? undefined : () => handleControlLongPress(item)}
                              delayLongPress={item.isDraft ? undefined : 600}
                            >
                              {item.isDraft ? (
                                <Ionicons name="document-text-outline" size={leadingIconSize} color="#FFD600" style={{ marginRight: leadingIconMarginRight }} />
                              ) : item.type === 'Skyddsrond' ? (
                                hasDeviation
                                  ? <Ionicons name="alert-circle" size={leadingIconSize} color="#D32F2F" style={{ marginRight: leadingIconMarginRight }} />
                                  : (
                                    <Svg width={leadingIconSize} height={leadingIconSize} viewBox="0 0 24 24" style={{ marginRight: leadingIconMarginRight }}>
                                      <Circle cx={12} cy={12} r={10} fill="#43A047" stroke="#222" strokeWidth={1} />
                                      <SvgText
                                        x="12"
                                        y="13.5"
                                        fontSize="16"
                                        fontWeight="bold"
                                        fill="#fff"
                                        textAnchor="middle"
                                        alignmentBaseline="middle"
                                      >
                                        ✓
                                      </SvgText>
                                    </Svg>
                                  )
                              ) : (
                                <Svg width={leadingIconSize} height={leadingIconSize} viewBox="0 0 24 24" style={{ marginRight: leadingIconMarginRight }}>
                                  <Circle cx={12} cy={12} r={10} fill="#43A047" stroke="#222" strokeWidth={1} />
                                  <SvgText
                                    x="12"
                                    y="13.5"
                                    fontSize="16"
                                    fontWeight="bold"
                                    fill="#fff"
                                    textAnchor="middle"
                                    alignmentBaseline="middle"
                                  >
                                    ✓
                                  </SvgText>
                                </Svg>
                              )}
                              <View style={(Platform.OS === 'web') ? styles.controlTextContainerWeb : styles.controlTextContainer}>
                                {Platform.OS === 'web' ? (
                                  <Text style={styles.controlLine} numberOfLines={1} ellipsizeMode="tail">
                                    <Text style={styles.controlTitleInlineWeb}>{label}</Text>
                                    {subtitle ? <Text style={styles.controlSubtitleInline}> — {subtitle}</Text> : null}
                                  </Text>
                                ) : (
                                  <>
                                    <Text style={styles.controlTitle} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
                                    {subtitle ? (
                                      <Text style={styles.controlSubtitle} numberOfLines={1} ellipsizeMode="tail">{subtitle}</Text>
                                    ) : null}
                                  </>
                                )}
                              </View>

                              {Platform.OS === 'web' && !item.isDraft && item.type === 'Skyddsrond' && hasDeviation && (
                                <TouchableOpacity
                                  style={{ marginLeft: trailingIconMarginLeft, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FFD600', alignSelf: 'center' }}
                                  activeOpacity={0.85}
                                  onPress={(e) => {
                                    try { e && e.stopPropagation && e.stopPropagation(); } catch(_e) {}
                                    navigation.navigate('ControlDetails', { control: item, project, companyId });
                                  }}
                                  accessibilityLabel="Åtgärda"
                                >
                                  <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>Åtgärda</Text>
                                </TouchableOpacity>
                              )}

                              {/* Skriv ut-ikon (endast för slutförda) */}
                              {!item.isDraft && (
                                <TouchableOpacity
                                  style={{ marginLeft: trailingIconMarginLeft, padding: trailingIconPadding }}
                                  onPress={async (e) => {
                                    e.stopPropagation && e.stopPropagation();
                                    try {
                                      setExportingPdf(true);
                                      // Bygg HTML för EN kontroll
                                      let companyNameForPdf = 'FÖRETAG AB';
                                      try {
                                        console.log('[PDF] using buildSummaryHtml?', typeof buildSummaryHtml);
                                        // Prepare logo (prefer company profile for PDF; try downloading + base64 embed)
                                        let profile = companyProfile;
                                        if (!profile && companyId) {
                                          try {
                                            profile = await fetchCompanyProfile(companyId);
                                            if (profile) setCompanyProfile(profile);
                                          } catch(_e) {}
                                        }
                                        companyNameForPdf = profile?.name || profile?.companyName || project?.client || project?.name || 'FÖRETAG AB';
                                        const companyLogoFromProfile = profile?.logoUrl || null;
                                        let logoForPrint = companyLogoFromProfile || companyLogoUri || null;
                                        if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
                                          try {
                                            const fileName = 'company-logo.single.png';
                                            const baseDir = (FileSystem && (FileSystem.cacheDirectory || FileSystem.documentDirectory)) ? (FileSystem.cacheDirectory || FileSystem.documentDirectory) : null;
                                            if (baseDir) {
                                              const dest = baseDir + fileName;
                                              const dl = await FileSystem.downloadAsync(logoForPrint, dest);
                                              if (dl?.uri) logoForPrint = dl.uri;
                                            }
                                          } catch(e) { console.warn('[PDF] download logo failed', e); }
                                        }
                                        let logoBase64 = null;
                                        try {
                                          logoBase64 = await readUriAsBase64(logoForPrint);
                                          if (!logoBase64) {
                                            try {
                                              const a = Asset.fromModule(require('../assets/images/foretag_ab.png'));
                                              await Asset.loadAsync(a);
                                              const local = a.localUri || a.uri;
                                              if (local) {
                                                logoBase64 = await readUriAsBase64(local);
                                                if (logoBase64) logoForPrint = 'data:image/png;base64,' + logoBase64;
                                              }
                                            } catch(_e) { /* ignore */ }
                                          } else {
                                            logoForPrint = 'data:image/png;base64,' + logoBase64;
                                          }
                                        } catch(e) { console.warn('[PDF] logo base64 convert failed', e); }

                                        let html;
                                        // Embed images for this item before building HTML
                                        const embeddedItem = await embedImagesInControl(item);
                                        if (typeof buildSummaryHtml === 'function') {
                                          html = buildSummaryHtml('En', logoForPrint, [embeddedItem]);
                                          } else {
                                          console.warn('[PDF] buildSummaryHtml not found, falling back to type-aware builder');
                                          const companyObj = { name: companyNameForPdf, logoUrl: companyLogoFromProfile, logoBase64 };
                                          html = buildPdfHtmlForControl({ control: embeddedItem, project, company: companyObj });
                                        }
                                        // Generate PDF file and present share/save dialog instead of directly printing
                                        const fileResult = await Print.printToFileAsync({ html });
                                        const pdfUri = fileResult?.uri;
                                        if (pdfUri) {
                                          try {
                                            // On iOS/Android this opens native share/save UI (Save to Files, etc.)
                                            if (Sharing && Sharing.isAvailableAsync) {
                                              const avail = await Sharing.isAvailableAsync();
                                              if (avail) {
                                                await Sharing.shareAsync(pdfUri, { dialogTitle: 'Spara PDF' });
                                              } else {
                                                // Fallback: just log path and show notice
                                                console.log('[PDF] PDF generated at', pdfUri);
                                                setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri });
                                              }
                                            } else {
                                              console.log('[PDF] PDF generated at', pdfUri);
                                              setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri });
                                            }
                                          } catch (shareErr) {
                                            console.warn('[PDF] shareAsync failed, opening print dialog as fallback', shareErr);
                                            await Print.printAsync({ uri: pdfUri });
                                          }
                                        } else {
                                          throw new Error('printToFileAsync returned no uri');
                                        }
                                      } catch(e) {
                                        console.warn('[PDF] single-item PDF generation failed, retrying without logo', e);
                                        try {
                                          let html2;
                                          if (typeof buildSummaryHtml === 'function') {
                                            html2 = buildSummaryHtml('En', null, [item]);
                                          } else {
                                            html2 = buildPdfHtmlForControl({ control: item, project, company: { name: companyNameForPdf } });
                                          }
                                          // Try generating file again without logo
                                          const fileResult2 = await Print.printToFileAsync({ html: html2 });
                                          const pdfUri2 = fileResult2?.uri;
                                          if (pdfUri2) {
                                            try {
                                              const avail2 = await Sharing.isAvailableAsync();
                                              if (avail2) await Sharing.shareAsync(pdfUri2, { dialogTitle: 'Spara PDF' });
                                              else setNotice({ visible: true, text: 'PDF genererad: ' + pdfUri2 });
                                            } catch (shareErr2) {
                                              console.warn('[PDF] shareAsync failed (retry), falling back to print dialog', shareErr2);
                                              await Print.printAsync({ uri: pdfUri2 });
                                            }
                                          } else {
                                            throw new Error('printToFileAsync retry returned no uri');
                                          }
                                        } catch (err2) {
                                          console.error('[PDF] single-item print fallback failed', err2);
                                          setNotice({ visible: true, text: 'Kunde inte generera eller dela PDF — se konsolen för detaljer' });
                                        }
                                      }
                                    } finally {
                                      setExportingPdf(false);
                                    }
                                  }}
                                  accessibilityLabel="Exportera denna kontroll som PDF"
                                >
                                  <Ionicons name="document-outline" size={leadingIconSize} color="#1976D2" />
                                </TouchableOpacity>
                              )}
                              {/* Papperskorg-ikon med bekräftelsemodal (både för utkast och slutförda) */}
                              <TouchableOpacity
                                style={{ marginLeft: trailingIconMarginLeft, padding: trailingIconPadding }}
                                onPress={(e) => {
                                  e.stopPropagation && e.stopPropagation();
                                  setDeleteConfirm({ visible: true, control: item });
                                }}
                                accessibilityLabel={item.isDraft ? "Radera pågående kontroll" : "Radera denna kontroll"}
                              >
                                <Ionicons name="trash-outline" size={leadingIconSize} color="#D32F2F" />
                              </TouchableOpacity>

                              {/* Modal för raderingsbekräftelse (läggs i JSX utanför listan) */}
                              {/* Bekräftelsemodal för radering av kontroll */}
                              <Modal
                                visible={deleteConfirm.visible}
                                transparent
                                animationType="fade"
                                onRequestClose={() => setDeleteConfirm({ visible: false, control: null })}
                              >
                                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
                                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, minWidth: 260, maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                                    <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 18, color: '#D32F2F', textAlign: 'center' }}>
                                      Vill du verkligen radera denna kontroll?
                                    </Text>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                                      <TouchableOpacity
                                        style={{ backgroundColor: '#D32F2F', borderRadius: 8, padding: 12, flex: 1, marginRight: 8, alignItems: 'center' }}
                                        onPress={handleDeleteSelectedControl}
                                      >
                                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Radera</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, flex: 1, marginLeft: 8, alignItems: 'center' }}
                                        onPress={() => setDeleteConfirm({ visible: false, control: null })}
                                      >
                                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                </View>
                              </Modal>
                            </TouchableOpacity>
                          </View>
                        );
                      })
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })()}
        </View>
      )}

      {/* Kalkyl Section - Placeholder for future implementation */}
      <ProjectDetailsSectionKalkyl activeSection={activeSection} />

      {/* Formulär */}
      {showForm && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
          style={styles.form}
        >
          <Text style={styles.selectedType}>Vald kontroll: {newControl.type}</Text>

          {/* Visa dagens datum och möjlighet att välja eget */}
          <Text style={styles.infoText}>Dagens datum: {newControl.date}</Text>
          <TouchableOpacity onPress={() => setNewControl({ ...newControl, date: '' })}>
            <Text style={styles.linkText}>Välj eget datum</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Datum (ÅÅÅÅ-MM-DD)"
            placeholderTextColor="#888"
            value={newControl.date}
            onChangeText={(text) => setNewControl({ ...newControl, date: text })}
            onFocus={() => {
              setTimeout(() => {
                if (scrollRef.current && typeof scrollRef.current.scrollToEnd === 'function') {
                  try { scrollRef.current.scrollToEnd({ animated: true }); } catch {}
                }
              }, 50);
            }}
          />
          <TextInput
            style={styles.input}
            placeholder={newControl.type === 'Skyddsrond' ? 'Skyddsrond omfattar' : 'Beskrivning'}
            placeholderTextColor="#888"
            value={newControl.description}
            onChangeText={(text) => setNewControl({ ...newControl, description: text })}
            onFocus={() => {
              setTimeout(() => {
                if (scrollRef.current && typeof scrollRef.current.scrollToEnd === 'function') {
                  try { scrollRef.current.scrollToEnd({ animated: true }); } catch {}
                }
              }, 50);
            }}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleAddControl}>
            <Text style={styles.saveButtonText}>Skapa kontroll</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowForm(false); }}>
            <Text style={styles.cancelText}>Avbryt</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}

      {undoState.visible ? (
        <View style={styles.undoBar}>
          <Text style={styles.undoText}>Kontroll borttagen</Text>
          <TouchableOpacity onPress={handleUndo}>
            <Text style={styles.undoButtonText}>Ångra</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {notice.visible ? (
        <View style={styles.noticeBar}>
          <Text style={styles.noticeText}>{notice.text}</Text>
        </View>
      ) : null}

      <Modal visible={showSummary} transparent animationType="fade" onRequestClose={() => setShowSummary(false)}>
        <TouchableOpacity style={styles.centerOverlay} activeOpacity={1} onPress={() => setShowSummary(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
            <View style={styles.summaryCard}>
              {/* Stäng (X) knapp uppe till höger */}
              <TouchableOpacity
                style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowSummary(false); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={26} color="#222" />
              </TouchableOpacity>
              <Text style={styles.modalText}>Skriv ut</Text>
              {/* Export filter selector */}
              {(() => {
                const byType = controls.reduce((acc, c) => {
                  const t = c.type || 'Okänd';
                  (acc[t] = acc[t] || []).push(c);
                  return acc;
                }, {});
                const types = Object.keys(byType).sort((a, b) => a.localeCompare(b));
                if (types.length === 0) return null;
                const labels = {
                  Arbetsberedning: 'Arbetsberedningar',
                  Egenkontroll: 'Egenkontroller',
                  Fuktmätning: 'Fuktmätningar',
                  Skyddsrond: 'Skyddsronder',
                  Riskbedömning: 'Riskbedömningar',
                };
                return (
                  <View style={styles.filterRow}>
                    {['Alla', ...types].map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => { try { Haptics.selectionAsync(); } catch {}; setExportFilter(t); }}
                        style={[styles.filterChip, exportFilter === t && styles.filterChipSelected]}
                      >
                        <Text style={[styles.filterChipText, exportFilter === t && styles.filterChipTextSelected]}>
                          {t === 'Alla' ? 'Alla' : (labels[t] || t)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}

              <ScrollView style={{ maxHeight: 380 }}>
                {/* Här kan du lägga till en preview av PDF-innehållet om du vill */}
              </ScrollView>
              <View style={{ marginTop: 10 }}>
                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      marginBottom: 8,
                      opacity: exportingPdf || controls.length === 0 ? 0.7 : 1,
                    },
                  ]}
                  onPress={handlePreviewPdf}
                  disabled={exportingPdf || controls.length === 0}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>Förhandsvisa PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      marginBottom: 8,
                      opacity: exportingPdf || controls.length === 0 ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleExportPdf}
                  disabled={exportingPdf || controls.length === 0}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>{exportingPdf ? 'Genererar…' : 'Exportera PDF'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

    </ScrollView>
  );
}




