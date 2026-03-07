/**
 * Översikt Summary - Overview summary for kalkylskede
 * Simplified card structure
 * Shows when no specific item is selected in Översikt section
 */

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PhaseChangeLoadingModal } from '../../../../../../components/common/Modals';
import SelectDropdown from '../../../../../../components/common/SelectDropdown';
import IsoDatePickerModal from '../../../../../../components/common/Modals/IsoDatePickerModal';
import ConfirmModal from '../../../../../../components/common/Modals/ConfirmModal';
import { auth, fetchCompanyProject, fetchCompanySuppliers, fetchCompanyCustomers, getCompanySharePointSiteId, hasDuplicateProjectNumber, patchCompanyProject, patchSharePointProjectMetadata, renameSharePointProjectFolderAndUpdateProject, updateCompanySupplier, updateCompanyCustomer, updateSharePointProjectPropertiesFromFirestoreProject, upsertProjectInfoTimelineMilestone } from '../../../../../../components/firebase';
import { emitProjectUpdated } from '../../../../../../components/projectBus';
import { useProjectTimelineDates } from '../../../../../../hooks/useProjectTimelineDates';
import { PROJECT_PHASES } from '../../../../../projects/constants';
import PersonSelector from '../../components/PersonSelector';
import { enqueueFsExcelSync } from '../../services/fragaSvarExcelSyncQueue';
import { formatOrganizationNumber } from '../../../../../../utils/formatOrganizationNumber';
import ProjectAddressMap from '../../../../../../components/common/ProjectAddressMap';

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

export default function OversiktSummary({ projectId, companyId, project }) {
  const navigation = useNavigation();

  // Track if there are unsaved changes per card
  const [hasChangesInfo, setHasChangesInfo] = useState(false);
  const [hasChangesKund, setHasChangesKund] = useState(false);
  const [hasChangesAdress, setHasChangesAdress] = useState(false);
  const [hasChangesTider, setHasChangesTider] = useState(false);
  const [hasChangesAnteckningar, setHasChangesAnteckningar] = useState(false);

  // Saving flag used by multiple save handlers (must always be defined)
  const [saving, setSaving] = useState(false);

  // Save feedback overlay: keep it visible briefly after saving completes.
  const [saveFeedback, setSaveFeedback] = useState({
    visible: false,
    mode: 'loading', // 'loading' | 'success'
    title: 'Sparar ändringar…',
    subtitle: 'Sparar till SharePoint/Firebase. Vänta lite…',
  });
  const saveFeedbackRef = React.useRef({ startedAt: 0, timers: [] });

  const clearSaveFeedbackTimers = React.useCallback(() => {
    const timers = saveFeedbackRef.current?.timers;
    if (Array.isArray(timers)) {
      timers.forEach((t) => {
        try { clearTimeout(t); } catch (_e) {}
      });
    }
    saveFeedbackRef.current.timers = [];
  }, []);

  useEffect(() => {
    return () => {
      clearSaveFeedbackTimers();
    };
  }, [clearSaveFeedbackTimers]);

  const showSavingFeedback = React.useCallback((opts = {}) => {
    clearSaveFeedbackTimers();
    saveFeedbackRef.current.startedAt = Date.now();
    setSaveFeedback({
      visible: true,
      mode: 'loading',
      title: opts.title || 'Sparar ändringar…',
      subtitle: opts.subtitle || 'Sparar till SharePoint/Firebase. Vänta lite…',
    });
  }, [clearSaveFeedbackTimers]);

  const showSaveSuccessFeedback = React.useCallback((subtitle = '') => {
    const MIN_LOADING_MS = 400;
    const SUCCESS_MS = 1000;
    const startedAt = Number(saveFeedbackRef.current.startedAt || 0);
    const elapsed = startedAt ? (Date.now() - startedAt) : MIN_LOADING_MS;
    const waitMs = Math.max(0, MIN_LOADING_MS - elapsed);

    const t1 = setTimeout(() => {
      setSaveFeedback({
        visible: true,
        mode: 'success',
        title: 'Ändringar sparade',
        subtitle: subtitle ? String(subtitle) : '',
      });
    }, waitMs);

    const t2 = setTimeout(() => {
      setSaveFeedback((prev) => ({ ...prev, visible: false }));
    }, waitMs + SUCCESS_MS);

    saveFeedbackRef.current.timers = [t1, t2];
  }, []);

  const hideSaveFeedback = React.useCallback(() => {
    clearSaveFeedbackTimers();
    setSaveFeedback((prev) => ({ ...prev, visible: false }));
  }, [clearSaveFeedbackTimers]);

  // Dropdown state + info modal state (must always be defined)
  const [upphandlingsformDropdownVisible, setUpphandlingsformDropdownVisible] = useState(false);
  const [entreprenadformDropdownVisible, setEntreprenadformDropdownVisible] = useState(false);
  const [phaseDropdownVisible, setPhaseDropdownVisible] = useState(false);
  const [kontaktpersonSelectorVisible, setKontaktpersonSelectorVisible] = useState(false);
  const [infoTooltipVisible, setInfoTooltipVisible] = useState(false);
  const [infoTooltipText, setInfoTooltipText] = useState('');

  // Date picker modal state for ISO dates
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerField, setDatePickerField] = useState(null); // 'sistaDagForFragor' | 'anbudsinlamning' | 'planeradByggstart' | 'klartForBesiktning'
  const [clearConfirmField, setClearConfirmField] = useState(null); // samma keys – när satt visas ConfirmModal "Töm datum"

  const { customDates: timelineCustomDates = [] } = useProjectTimelineDates(companyId || null, projectId || null);

  const FIELD_TO_SOURCE_KEY = {
    sistaDagForFragor: 'sista-dag-for-fragor',
    anbudsinlamning: 'anbudsinlamning',
    planeradByggstart: 'planerad-byggstart',
    klartForBesiktning: 'klart-for-besiktning',
  };
  const hasOutlookForField = useCallback((fieldKey) => {
    const sourceKey = FIELD_TO_SOURCE_KEY[fieldKey];
    if (!sourceKey) return false;
    const item = (timelineCustomDates || []).find(
      (d) => String(d?.source || '').trim() === 'projectinfo' && String(d?.sourceKey || '').trim() === sourceKey
    );
    return Boolean(
      item &&
        (item.outlookEventId ||
          item?.outlook?.eventId ||
          item.outlookStatus === 'sent' ||
          item?.outlook === 'sent')
    );
  }, [timelineCustomDates]);

  // Store original values to detect changes
  const [originalValues, setOriginalValues] = useState({});

  // Project info state
  const initialProjectNumber = project?.projectNumber || project?.number || project?.id || '';
  const [projectNumber, setProjectNumber] = useState(initialProjectNumber);
  const initialRawProjectName = project?.projectName || project?.name || '';
  const initialProjectName = (() => {
    const name = String(initialRawProjectName || '').trim();
    const num = String(initialProjectNumber || '').trim();
    if (!project?.projectName && num && name.startsWith(num)) {
      let rest = name.slice(num.length).trim();
      if (rest.startsWith('-') || rest.startsWith('–') || rest.startsWith('—')) {
        rest = rest.slice(1).trim();
      }
      return rest;
    }
    return name;
  })();
  const [projectName, setProjectName] = useState(initialProjectName);
  const [phaseKey, setPhaseKey] = useState(project?.phase || project?.phaseKey || 'kalkylskede');
  const [status, setStatus] = useState(project?.status || 'ongoing');

  // Use ref to track previous project values to avoid unnecessary state updates
  const prevProjectRef = React.useRef(null);
  const prevProjectIdRef = React.useRef(null);
  // After save, avoid overwriting originalValues with stale project (parent may not have re-rendered yet)
  const lastSavedInfoRef = React.useRef(null);
  const lastSavedKundRef = React.useRef(null);
  /** När true: tvinga hasChangesKundComputed till false i en render så att gul markering försvinner direkt efter Kund-sparning */
  const kundJustSavedRef = React.useRef(false);

  // Update state when project values actually change (not just object reference)
  useEffect(() => {
    const nextPid = String(projectId || project?.id || '').trim();
    const prevPid = String(prevProjectIdRef.current || '').trim();
    const projectChanged = !!nextPid && !!prevPid && nextPid !== prevPid;

    // If we just saved project info, don't overwrite originalValues with stale project (parent may not have re-rendered yet)
    const saved = lastSavedInfoRef.current;
    if (saved && project && !projectChanged) {
      const projNum = String(project?.projectNumber ?? project?.number ?? project?.id ?? '').trim();
      const projName = String(project?.projectName ?? project?.name ?? '').trim();
      if (projNum !== saved.projectNumber || projName !== saved.projectName) {
        return;
      }
      lastSavedInfoRef.current = null;
    }

    // If user has unsaved edits, do NOT reset the entire card state due to background project updates.
    // Exception: if switching to a different project, always reset.
    const hasAnyUnsavedNow = Boolean(
      hasChangesInfo || hasChangesKund || hasChangesAdress || hasChangesTider || hasChangesAnteckningar
    );
    if (!projectChanged && hasAnyUnsavedNow) {
      return;
    }

    // Extract project values as a string for comparison (include projectNumber/projectName so sync runs when they change after save)
    const projectKey = project ? JSON.stringify({
      id: project.id,
      name: project.name,
      projectNumber: project.projectNumber ?? project.number ?? project.id,
      projectName: project.projectName ?? project.name,
      phase: project.phase || project.phaseKey,
      projectType: project.projectType,
      upphandlingsform: project.upphandlingsform,
      status: project.status,
      kund: project.kund || project.client,
      organisationsnummer: project.organisationsnummer,
      kontaktperson: project.kontaktperson,
      telefon: project.telefon,
      epost: project.epost || project.email,
      adress: project.adress,
      kommun: project.kommun,
      region: project.region,
      fastighetsbeteckning: project.fastighetsbeteckning,
      latitude: project.latitude,
      longitude: project.longitude,
      // Canonical important dates (required fields)
      lastQuestionDate: project.lastQuestionDate,
      tenderSubmissionDate: project.tenderSubmissionDate,
      plannedConstructionStart: project.plannedConstructionStart,
      readyForInspectionDate: project.readyForInspectionDate,
      // Legacy mirrors (keep for backwards compatibility)
      sistaDagForFragor: project.sistaDagForFragor,
      anbudsinlamning: project.anbudsinlamning || project.anbudstid,
      planeradByggstart: project.planeradByggstart || project.byggstart,
      klartForBesiktning: project.klartForBesiktning || project.fardigstallning,
      anteckningar: project.anteckningar || project.beskrivning
    }) : '';

    // If we just saved Kund, always apply lastSavedKundRef so state/originalValues stay in sync (don't return early)
    const hasJustSavedKund = !!lastSavedKundRef.current;
    // Only update if project values actually changed, not just the object reference (unless we just saved Kund)
    if (!hasJustSavedKund && prevProjectRef.current === projectKey) {
      return;
    }
    
    prevProjectRef.current = projectKey;
    prevProjectIdRef.current = nextPid || project?.id || null;

    const rawProjectNumber = project?.projectNumber || project?.number || project?.id || '';
    const rawProjectName = project?.projectName || project?.name || '';
    const cleanedProjectName = (() => {
      const name = String(rawProjectName || '').trim();
      const num = String(rawProjectNumber || '').trim();
      if (!project?.projectName && num && name.startsWith(num)) {
        let rest = name.slice(num.length).trim();
        if (rest.startsWith('-') || rest.startsWith('–') || rest.startsWith('—')) {
          rest = rest.slice(1).trim();
        }
        return rest;
      }
      return name;
    })();

    const savedKund = lastSavedKundRef.current;
    if (savedKund) lastSavedKundRef.current = null;
    const newValues = {
      projectNumber: rawProjectNumber,
      projectName: cleanedProjectName,
      phaseKey: project?.phase || project?.phaseKey || 'kalkylskede',
      projectType: project?.projectType || '',
      upphandlingsform: project?.upphandlingsform || '',
      status: project?.status || 'ongoing',
      kund: savedKund ? savedKund.kund : (project?.kund || project?.client || ''),
      organisationsnummer: savedKund ? savedKund.organisationsnummer : formatOrganizationNumber(project?.organisationsnummer || ''),
      kontaktperson: savedKund ? savedKund.kontaktperson : (project?.kontaktperson || null),
      telefon: savedKund ? savedKund.telefon : (project?.telefon || ''),
      epost: savedKund ? savedKund.epost : (project?.epost || project?.email || ''),
      adress: project?.adress || '',
      kommun: project?.kommun || '',
      region: project?.region || '',
      fastighetsbeteckning: project?.fastighetsbeteckning || '',
      latitude: project?.latitude ?? null,
      longitude: project?.longitude ?? null,
      // Hydrate from canonical fields first, then fall back to legacy mirrors.
      sistaDagForFragor: project?.lastQuestionDate || project?.sistaDagForFragor || '',
      anbudsinlamning: project?.tenderSubmissionDate || project?.anbudsinlamning || project?.anbudstid || '',
      planeradByggstart: project?.plannedConstructionStart || project?.planeradByggstart || project?.byggstart || '',
      klartForBesiktning: project?.readyForInspectionDate || project?.klartForBesiktning || project?.fardigstallning || '',
      anteckningar: project?.anteckningar || project?.beskrivning || ''
    };

    setOriginalValues(newValues);
    setProjectNumber(newValues.projectNumber);
    setProjectName(newValues.projectName);
    setPhaseKey(newValues.phaseKey);
    setProjectType(newValues.projectType);
    setUpphandlingsform(newValues.upphandlingsform);
    setStatus(newValues.status);
    setKund(newValues.kund);
    setOrganisationsnummer(formatOrganizationNumber(newValues.organisationsnummer || ''));
    setKontaktperson(newValues.kontaktperson);
    setLinkedKundSupplierId(project?.linkedKundSupplierId ?? null);
    setLinkedKundCustomerId(project?.linkedKundCustomerId ?? null);
    setTelefon(newValues.telefon);
    setEpost(newValues.epost);
    setAdress(newValues.adress);
    setKommun(newValues.kommun);
    setRegion(newValues.region);
    setFastighetsbeteckning(newValues.fastighetsbeteckning);
    setLatitude(newValues.latitude ?? null);
    setLongitude(newValues.longitude ?? null);
    setSistaDagForFragor(newValues.sistaDagForFragor);
    setAnbudsinlamning(newValues.anbudsinlamning);
    setPlaneradByggstart(newValues.planeradByggstart);
    setKlartForBesiktning(newValues.klartForBesiktning);
    setAnteckningar(newValues.anteckningar);
    
    // Reset all change flags
    setHasChangesInfo(false);
    setHasChangesKund(false);
    setHasChangesAdress(false);
    setHasChangesTider(false);
    setHasChangesAnteckningar(false);
  }, [project, projectId, hasChangesInfo, hasChangesKund, hasChangesAdress, hasChangesTider, hasChangesAnteckningar]);

  const [projectType, setProjectType] = useState(project?.projectType || '');
  const [upphandlingsform, setUpphandlingsform] = useState(project?.upphandlingsform || '');

  // Kund & Beställare state
  const [kund, setKund] = useState(project?.kund || project?.client || '');
  const [organisationsnummer, setOrganisationsnummer] = useState(project?.organisationsnummer || '');
  const [kontaktperson, setKontaktperson] = useState(project?.kontaktperson || null); // { type, id, name, email, phone }
  const [linkedKundSupplierId, setLinkedKundSupplierId] = useState(project?.linkedKundSupplierId ?? null);
  const [linkedKundCustomerId, setLinkedKundCustomerId] = useState(project?.linkedKundCustomerId ?? null);
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [companySearchResults, setCompanySearchResults] = useState([]);
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [companySearchLoading, setCompanySearchLoading] = useState(false);
  const companySearchDebounceRef = React.useRef(null);
  const [telefon, setTelefon] = useState(project?.telefon || '');
  const [epost, setEpost] = useState(project?.epost || project?.email || '');

  // Projektadress & plats state
  const [adress, setAdress] = useState(project?.adress || '');
  const [kommun, setKommun] = useState(project?.kommun || '');
  const [region, setRegion] = useState(project?.region || '');
  const [fastighetsbeteckning, setFastighetsbeteckning] = useState(project?.fastighetsbeteckning || '');
  const [latitude, setLatitude] = useState(project?.latitude != null ? project.latitude : null);
  const [longitude, setLongitude] = useState(project?.longitude != null ? project.longitude : null);
  const [addressMode, setAddressMode] = useState('manual'); // 'manual' | 'map'

  // Viktiga datum state (4 fixed fields)
  const [sistaDagForFragor, setSistaDagForFragor] = useState(project?.sistaDagForFragor || '');
  const [anbudsinlamning, setAnbudsinlamning] = useState(project?.anbudsinlamning || project?.anbudstid || '');
  const [planeradByggstart, setPlaneradByggstart] = useState(project?.planeradByggstart || project?.byggstart || '');
  const [klartForBesiktning, setKlartForBesiktning] = useState(project?.klartForBesiktning || project?.fardigstallning || '');

  // Kalkylanteckningar state (simplified from "Kalkylkritisk sammanfattning")
  const [anteckningar, setAnteckningar] = useState(project?.anteckningar || project?.beskrivning || '');

  // Helper function to update project in hierarchy
  // Legacy Firestore-hierarki är avvecklad – men vi använder denna som central persistensväg.
  // Source of truth = backend (Firestore). Returnerar alltid nyhämtat projekt efter patch.
  const updateProjectInHierarchy = async (updates) => {
    const cid = String(companyId || '').trim();
    const pid = String(projectId || project?.id || '').trim();
    if (!cid || !pid) {
      throw new Error('Saknar companyId eller projectId – kan inte spara projektet.');
    }

    const u = (updates && typeof updates === 'object') ? { ...updates } : {};
    const patch = { ...u, companyId: cid };

    const beforePn = String(project?.projectNumber || project?.number || project?.id || '').trim();
    const beforePnm = String(project?.projectName || project?.name || '').trim();
    const updatesProjectIdentity = (
      Object.prototype.hasOwnProperty.call(u, 'projectNumber') ||
      Object.prototype.hasOwnProperty.call(u, 'projectName') ||
      Object.prototype.hasOwnProperty.call(u, 'name') ||
      Object.prototype.hasOwnProperty.call(u, 'id')
    );

    // Normalize name/number. UI uses projectNumber/projectName.
    // We also mirror to common aliases used around the app.
    const nextNumber =
      Object.prototype.hasOwnProperty.call(u, 'projectNumber')
        ? String(u.projectNumber || '').trim()
        : (Object.prototype.hasOwnProperty.call(u, 'id') ? String(u.id || '').trim() : '');

    const nextName =
      Object.prototype.hasOwnProperty.call(u, 'projectName')
        ? String(u.projectName || '').trim()
        : (Object.prototype.hasOwnProperty.call(u, 'name') ? String(u.name || '').trim() : '');

    // Never treat projektnummer edit as Firestore doc-id rename here.
    if (Object.prototype.hasOwnProperty.call(patch, 'id')) delete patch.id;
    if (Object.prototype.hasOwnProperty.call(patch, 'projectId')) delete patch.projectId;

    if (Object.prototype.hasOwnProperty.call(u, 'name')) {
      patch.name = nextName || null;
    }

    if (Object.prototype.hasOwnProperty.call(u, 'projectName') || Object.prototype.hasOwnProperty.call(u, 'name')) {
      patch.projectName = nextName || null;
    }

    if (Object.prototype.hasOwnProperty.call(u, 'projectNumber') || Object.prototype.hasOwnProperty.call(u, 'id')) {
      patch.projectNumber = nextNumber || null;
      patch.number = nextNumber || null;
    }

    if ((nextNumber || nextName) && !Object.prototype.hasOwnProperty.call(patch, 'fullName')) {
      patch.fullName = (nextNumber && nextName) ? `${nextNumber} - ${nextName}` : (nextName || nextNumber || null);
    }

    // Mirror a few legacy field names used across the app.
    if (Object.prototype.hasOwnProperty.call(u, 'kund')) {
      const v = String(u.kund || '').trim();
      patch.client = v || null;
      patch.customer = v || null;
    }
    if (Object.prototype.hasOwnProperty.call(u, 'epost')) {
      patch.email = String(u.epost || '').trim() || null;
    }
    if (Object.prototype.hasOwnProperty.call(u, 'anteckningar')) {
      patch.beskrivning = String(u.anteckningar || '').trim() || null;
    }

    await patchCompanyProject(cid, pid, patch);

    const latest = await fetchCompanyProject(cid, pid);
    if (latest) {
      // Preserve any transient/non-Firestore fields already present on `project`.
      const merged = { ...(project || {}), ...latest };

      // Best-effort: update SharePoint Project Properties (library metadata) so Word/Excel Quick Parts update.
      if (updatesProjectIdentity) {
        const afterPn = String(merged?.projectNumber || merged?.number || merged?.id || '').trim();
        const afterPnm = String(merged?.projectName || merged?.name || '').trim();
        const normalizePn = (v) => String(v || '').trim().toLowerCase();
        const normalizePnm = (v) => String(v || '').trim().toLowerCase();
        if (normalizePn(afterPn) !== normalizePn(beforePn) || normalizePnm(afterPnm) !== normalizePnm(beforePnm)) {
          try {
            void updateSharePointProjectPropertiesFromFirestoreProject(cid, merged).catch((e) => {
              console.warn('[OversiktSummary] Kunde inte uppdatera SharePoint projektsmetadata (ProjectNumber/ProjectName):', e?.message || e);
            });
          } catch (e) {
            console.warn('[OversiktSummary] Kunde inte uppdatera SharePoint projektsmetadata (ProjectNumber/ProjectName):', e?.message || e);
          }
        }
      }

      return merged;
    }

    return { ...(project || {}), ...patch, id: pid };
  };

  // Defensive defaults: these must exist to prevent render crashes on web.
  // (If you later wire these to real data/hook, keep these as fallbacks.)
  const upphandlingsformOptions = [
    'Offentlig upphandling',
    'Privat upphandling',
    'Direktupphandling',
    'Övrigt'
  ];

  const entreprenadformOptions = [
    'Totalentreprenad',
    'Utförandeentreprenad',
    'Generalentreprenad',
    'Delad entreprenad',
    'Övrigt'
  ];

  const upphandlingsformInfo = {
    'Offentlig upphandling': 'Upphandling enligt LOU/LUF.',
    'Privat upphandling': 'Upphandling mellan privata aktörer.',
    'Direktupphandling': 'Upphandling utan annonsering (tröskelvärden/regler gäller).',
    'Övrigt': 'Annan typ av upphandling.'
  };

  const entreprenadformInfo = {
    'Totalentreprenad': 'Entreprenören ansvarar normalt för projektering och utförande.',
    'Utförandeentreprenad': 'Beställaren projekterar, entreprenören utför.',
    'Generalentreprenad': 'Generalentreprenör upphandlar underentreprenörer.',
    'Delad entreprenad': 'Beställaren upphandlar flera entreprenörer separat.',
    'Övrigt': 'Annan entreprenadform.'
  };

  // Helper function to check if project info has changes
  const checkInfoChanges = () => {
    return (
      projectNumber.trim() !== (originalValues.projectNumber || '') ||
      projectName.trim() !== (originalValues.projectName || '') ||
      String(phaseKey || '').trim() !== String(originalValues.phaseKey || '').trim() ||
      projectType.trim() !== (originalValues.projectType || '') ||
      upphandlingsform.trim() !== (originalValues.upphandlingsform || '') ||
      status !== (originalValues.status || 'ongoing')
    );
  };

  const phaseOptions = [
    { label: 'Kalkylskede', value: 'kalkylskede', color: PROJECT_PHASES.find(p => p.key === 'kalkylskede')?.color || '#1976D2' },
    { label: 'Produktion', value: 'produktion', color: PROJECT_PHASES.find(p => p.key === 'produktion')?.color || '#43A047' },
    { label: 'Avslut', value: 'avslut', color: PROJECT_PHASES.find(p => p.key === 'avslut')?.color || '#616161' },
    { label: 'Eftermarknad', value: 'eftermarknad', color: PROJECT_PHASES.find(p => p.key === 'eftermarknad')?.color || '#7B1FA2' },
  ];

  // Helper function to check if kund info has changes
  const checkKundChanges = () => {
    return (
      kund.trim() !== (originalValues.kund || '') ||
      organisationsnummer.trim() !== (originalValues.organisationsnummer || '') ||
      JSON.stringify(kontaktperson) !== JSON.stringify(originalValues.kontaktperson) ||
      telefon.trim() !== (originalValues.telefon || '') ||
      epost.trim() !== (originalValues.epost || '')
    );
  };

  // Helper function to check if adress info has changes
  const checkAdressChanges = () => {
    const latEq = (latitude == null && (originalValues.latitude == null || originalValues.latitude === '')) ||
      (latitude != null && Number(latitude) === Number(originalValues.latitude));
    const lngEq = (longitude == null && (originalValues.longitude == null || originalValues.longitude === '')) ||
      (longitude != null && Number(longitude) === Number(originalValues.longitude));
    return (
      adress.trim() !== (originalValues.adress || '') ||
      kommun.trim() !== (originalValues.kommun || '') ||
      region.trim() !== (originalValues.region || '') ||
      fastighetsbeteckning.trim() !== (originalValues.fastighetsbeteckning || '') ||
      !latEq ||
      !lngEq
    );
  };

  // Helper function to check if tider info has changes
  const checkTiderChanges = () => {
    return (
      sistaDagForFragor.trim() !== (originalValues.sistaDagForFragor || '') ||
      anbudsinlamning.trim() !== (originalValues.anbudsinlamning || '') ||
      planeradByggstart.trim() !== (originalValues.planeradByggstart || '') ||
      klartForBesiktning.trim() !== (originalValues.klartForBesiktning || '')
    );
  };

  // Helper function to check if anteckningar has changes
  const checkAnteckningarChanges = () => {
    return anteckningar.trim() !== (originalValues.anteckningar || '');
  };

  // Memoize originalValues string to prevent unnecessary recalculations
  const originalValuesKey = React.useMemo(() => {
    return JSON.stringify(originalValues);
  }, [originalValues.projectNumber, originalValues.projectName, originalValues.phaseKey, originalValues.projectType, originalValues.upphandlingsform, originalValues.status, originalValues.kund, originalValues.organisationsnummer, JSON.stringify(originalValues.kontaktperson), originalValues.telefon, originalValues.epost, originalValues.adress, originalValues.kommun, originalValues.region, originalValues.fastighetsbeteckning, originalValues.latitude, originalValues.longitude, originalValues.sistaDagForFragor, originalValues.anbudsinlamning, originalValues.planeradByggstart, originalValues.klartForBesiktning, originalValues.anteckningar]);

  // Calculate changes directly in render instead of useEffect to avoid re-renders during typing
  // These are computed values, not state, to prevent blocking input
  // Use string comparison for originalValues to avoid object reference issues
  const hasChangesInfoComputed = React.useMemo(() => checkInfoChanges(), [projectNumber, projectName, phaseKey, projectType, upphandlingsform, status, originalValuesKey]);
  const hasChangesKundComputed = React.useMemo(() => {
    if (kundJustSavedRef.current) return false;
    return checkKundChanges();
  }, [kund, organisationsnummer, JSON.stringify(kontaktperson), telefon, epost, originalValuesKey]);
  const hasChangesAdressComputed = React.useMemo(() => checkAdressChanges(), [adress, kommun, region, fastighetsbeteckning, latitude, longitude, originalValuesKey]);
  const hasChangesTiderComputed = React.useMemo(() => checkTiderChanges(), [sistaDagForFragor, anbudsinlamning, planeradByggstart, klartForBesiktning, originalValuesKey]);
  const hasChangesAnteckningarComputed = React.useMemo(() => checkAnteckningarChanges(), [anteckningar, originalValuesKey]);

  // Sync computed values to state (only when they actually change)
  useEffect(() => {
    if (hasChangesInfoComputed !== hasChangesInfo) {
      setHasChangesInfo(hasChangesInfoComputed);
    }
    if (hasChangesKundComputed !== hasChangesKund) {
      setHasChangesKund(hasChangesKundComputed);
    }
    if (hasChangesAdressComputed !== hasChangesAdress) {
      setHasChangesAdress(hasChangesAdressComputed);
    }
    if (hasChangesTiderComputed !== hasChangesTider) {
      setHasChangesTider(hasChangesTiderComputed);
    }
    if (hasChangesAnteckningarComputed !== hasChangesAnteckningar) {
      setHasChangesAnteckningar(hasChangesAnteckningarComputed);
    }
  }, [hasChangesInfoComputed, hasChangesKundComputed, hasChangesAdressComputed, hasChangesTiderComputed, hasChangesAnteckningarComputed]);

  const hasAnyUnsavedChanges = Boolean(
    hasChangesInfoComputed ||
    hasChangesKundComputed ||
    hasChangesAdressComputed ||
    hasChangesTiderComputed ||
    hasChangesAnteckningarComputed
  );
  const hasAnyUnsavedChangesRef = React.useRef(false);
  useEffect(() => {
    hasAnyUnsavedChangesRef.current = hasAnyUnsavedChanges;
  }, [hasAnyUnsavedChanges]);

  const resetInfoCardState = React.useCallback(() => {
    setProjectNumber(originalValues.projectNumber || '');
    setProjectName(originalValues.projectName || '');
    setPhaseKey(originalValues.phaseKey || 'kalkylskede');
    setProjectType(originalValues.projectType || '');
    setUpphandlingsform(originalValues.upphandlingsform || '');
    setStatus(originalValues.status || 'ongoing');

    setPhaseDropdownVisible(false);
    setUpphandlingsformDropdownVisible(false);
    setEntreprenadformDropdownVisible(false);

    setHasChangesInfo(false);
  }, [
    originalValues.projectNumber,
    originalValues.projectName,
    originalValues.phaseKey,
    originalValues.projectType,
    originalValues.upphandlingsform,
    originalValues.status,
  ]);

  const resetKundCardState = React.useCallback(() => {
    setKund(originalValues.kund || '');
    setOrganisationsnummer(formatOrganizationNumber(originalValues.organisationsnummer || ''));
    setKontaktperson(originalValues.kontaktperson || null);
    setTelefon(originalValues.telefon || '');
    setEpost(originalValues.epost || '');
    setLinkedKundSupplierId(project?.linkedKundSupplierId ?? null);
    setLinkedKundCustomerId(project?.linkedKundCustomerId ?? null);
    setCompanySearchQuery('');
    setCompanySearchResults([]);
    setCompanySearchOpen(false);
    setKontaktpersonSelectorVisible(false);
    setHasChangesKund(false);
  }, [
    originalValues.kund,
    originalValues.organisationsnummer,
    originalValues.kontaktperson,
    originalValues.telefon,
    originalValues.epost,
    project?.linkedKundSupplierId,
    project?.linkedKundCustomerId,
  ]);

  const resetAdressCardState = React.useCallback(() => {
    setAdress(originalValues.adress || '');
    setKommun(originalValues.kommun || '');
    setRegion(originalValues.region || '');
    setFastighetsbeteckning(originalValues.fastighetsbeteckning || '');
    setLatitude(originalValues.latitude ?? null);
    setLongitude(originalValues.longitude ?? null);
    setHasChangesAdress(false);
  }, [
    originalValues.adress,
    originalValues.kommun,
    originalValues.region,
    originalValues.fastighetsbeteckning,
    originalValues.latitude,
    originalValues.longitude,
  ]);

  const resetTiderCardState = React.useCallback(() => {
    setSistaDagForFragor(originalValues.sistaDagForFragor || '');
    setAnbudsinlamning(originalValues.anbudsinlamning || '');
    setPlaneradByggstart(originalValues.planeradByggstart || '');
    setKlartForBesiktning(originalValues.klartForBesiktning || '');
    setDatePickerVisible(false);
    setDatePickerField(null);
    setHasChangesTider(false);
  }, [
    originalValues.sistaDagForFragor,
    originalValues.anbudsinlamning,
    originalValues.planeradByggstart,
    originalValues.klartForBesiktning,
  ]);

  const resetAnteckningarCardState = React.useCallback(() => {
    setAnteckningar(originalValues.anteckningar || '');
    setHasChangesAnteckningar(false);
  }, [originalValues.anteckningar]);

  const resetAllDraftState = React.useCallback(() => {
    resetInfoCardState();
    resetKundCardState();
    resetAdressCardState();
    resetTiderCardState();
    resetAnteckningarCardState();
    setInfoTooltipVisible(false);
    setInfoTooltipText('');
  }, [
    resetInfoCardState,
    resetKundCardState,
    resetAdressCardState,
    resetTiderCardState,
    resetAnteckningarCardState,
  ]);

  // Block navigation away if there are unsaved edits (bonus requirement).
  useEffect(() => {
    if (!navigation || typeof navigation.addListener !== 'function') return;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!hasAnyUnsavedChangesRef.current) return;
      e.preventDefault();

      const message = 'Du har osparade ändringar. Om du lämnar sidan nu kommer ändringarna att försvinna.';

      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const ok = window.confirm(message);
        if (ok) {
          resetAllDraftState();
          navigation.dispatch(e.data.action);
        }
        return;
      }

      Alert.alert(
        'Osparade ändringar',
        message,
        [
          { text: 'Stanna kvar', style: 'cancel' },
          {
            text: 'Lämna utan att spara',
            style: 'destructive',
            onPress: () => {
              resetAllDraftState();
              navigation.dispatch(e.data.action);
            },
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, resetAllDraftState]);

  // Web: warn on tab close/refresh.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e) => {
      if (!hasAnyUnsavedChangesRef.current) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Memoized onChange handlers to prevent InfoRow re-renders
  const handleProjectNumberChange = useCallback((val) => {
    setProjectNumber(val);
  }, []);

  const handleProjectNameChange = useCallback((val) => {
    setProjectName(val);
  }, []);

  const handleProjectTypeChange = useCallback((val) => {
    setProjectType(val);
  }, []);

  const handleUpphandlingsformChange = useCallback((val) => {
    setUpphandlingsform(val);
  }, []);

  const handleCompanySearch = useCallback(
    (query) => {
      if (companySearchDebounceRef.current) clearTimeout(companySearchDebounceRef.current);
      const q = String(query ?? '').trim();
      setCompanySearchQuery(q);
      if (q.length < 2) {
        setCompanySearchResults([]);
        setCompanySearchOpen(false);
        return;
      }
      companySearchDebounceRef.current = setTimeout(async () => {
        const cid = String(companyId || '').trim();
        if (!cid) {
          setCompanySearchResults([]);
          companySearchDebounceRef.current = null;
          return;
        }
        setCompanySearchLoading(true);
        try {
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
              organizationNumber: s.organizationNumber ?? '',
            }));
          const fromCustomers = (customers || [])
            .filter((c) => String(c?.name ?? '').trim().toLowerCase().includes(lower))
            .map((c) => ({
              id: c.id,
              name: String(c.name ?? '').trim(),
              type: 'customer',
              organizationNumber: c.personalOrOrgNumber ?? '',
            }));
          const combined = [...fromSuppliers, ...fromCustomers].slice(0, 15);
          setCompanySearchResults(combined);
          setCompanySearchOpen(combined.length > 0);
        } catch {
          setCompanySearchResults([]);
        } finally {
          setCompanySearchLoading(false);
          companySearchDebounceRef.current = null;
        }
      }, 300);
    },
    [companyId]
  );

  const handleSelectCompany = useCallback((company) => {
    if (!company) return;
    const name = String(company.name ?? '').trim();
    const orgNr = formatOrganizationNumber(String(company.organizationNumber ?? '').trim());
    setKund(name);
    setOrganisationsnummer(orgNr);
    if (company.type === 'supplier') {
      setLinkedKundSupplierId(company.id || null);
      setLinkedKundCustomerId(null);
    } else {
      setLinkedKundCustomerId(company.id || null);
      setLinkedKundSupplierId(null);
    }
    setCompanySearchResults([]);
    setCompanySearchOpen(false);
    setCompanySearchQuery('');
    setHasChangesKund(true);
  }, []);

  const handleKundChange = useCallback((val) => {
    setKund(val);
    setCompanySearchQuery(val);
    if (String(val || '').trim().length >= 2) {
      handleCompanySearch(val);
    } else {
      setCompanySearchResults([]);
      setCompanySearchOpen(false);
      if (!val) {
        setLinkedKundSupplierId(null);
        setLinkedKundCustomerId(null);
      }
    }
  }, [handleCompanySearch]);

  const handleOrganisationsnummerChange = useCallback((val) => {
    setOrganisationsnummer(val);
  }, []);

  const handleTelefonChange = useCallback((val) => {
    setTelefon(val);
  }, []);

  const handleEpostChange = useCallback((val) => {
    setEpost(val);
  }, []);

  const handleAdressChange = useCallback((val) => {
    setAdress(val);
  }, []);

  const handleKommunChange = useCallback((val) => {
    setKommun(val);
  }, []);

  const handleRegionChange = useCallback((val) => {
    setRegion(val);
  }, []);

  const handleFastighetsbeteckningChange = useCallback((val) => {
    setFastighetsbeteckning(val);
  }, []);

  const handleAddressFromMap = useCallback(({ latitude: lat, longitude: lng, adress: a, kommun: k, region: r }) => {
    if (lat != null && lng != null) {
      setLatitude(lat);
      setLongitude(lng);
    }
    if (a !== undefined) setAdress(a);
    if (k !== undefined) setKommun(k);
    if (r !== undefined) setRegion(r);
    setHasChangesAdress(true);
  }, []);

  const handleSistaDagForFragorChange = useCallback((val) => {
    setSistaDagForFragor(val);
  }, []);

  const handleAnbudsinlamningChange = useCallback((val) => {
    setAnbudsinlamning(val);
  }, []);

  const handlePlaneradByggstartChange = useCallback((val) => {
    setPlaneradByggstart(val);
  }, []);

  const handleKlartForBesiktningChange = useCallback((val) => {
    setKlartForBesiktning(val);
  }, []);

  const openDatePicker = useCallback((fieldKey) => {
    setDatePickerField(fieldKey);
    setDatePickerVisible(true);
  }, []);

  const closeDatePicker = useCallback(() => {
    setDatePickerVisible(false);
    setDatePickerField(null);
  }, []);

  const requestClearDate = useCallback((fieldKey) => {
    if (datePickerField === fieldKey) {
      setDatePickerVisible(false);
      setDatePickerField(null);
    }
    setClearConfirmField(fieldKey);
  }, [datePickerField]);

  const performClearDate = useCallback(async () => {
    const fieldKey = clearConfirmField;
    setClearConfirmField(null);
    if (!fieldKey || !companyId || !projectId) return;

    const sourceKey = FIELD_TO_SOURCE_KEY[fieldKey];
    const empty = '';
    const updates = {};
    const canonical = {};
    const legacyMirror = {};
    if (fieldKey === 'sistaDagForFragor') {
      updates.sistaDagForFragor = empty;
      canonical.lastQuestionDate = empty;
      setSistaDagForFragor(empty);
    } else if (fieldKey === 'anbudsinlamning') {
      updates.anbudsinlamning = empty;
      canonical.tenderSubmissionDate = empty;
      legacyMirror.anbudstid = empty;
      setAnbudsinlamning(empty);
    } else if (fieldKey === 'planeradByggstart') {
      updates.planeradByggstart = empty;
      canonical.plannedConstructionStart = empty;
      legacyMirror.byggstart = empty;
      setPlaneradByggstart(empty);
    } else if (fieldKey === 'klartForBesiktning') {
      updates.klartForBesiktning = empty;
      canonical.readyForInspectionDate = empty;
      legacyMirror.fardigstallning = empty;
      setKlartForBesiktning(empty);
    }
    showSavingFeedback();
    setSaving(true);
    try {
      const updatedProject = await updateProjectInHierarchy({ ...canonical, ...updates, ...legacyMirror });
      await upsertProjectInfoTimelineMilestone(companyId, projectId, {
        key: sourceKey,
        title: fieldKey === 'sistaDagForFragor' ? 'Sista dag för frågor' : fieldKey === 'anbudsinlamning' ? 'Anbudsinlämning' : fieldKey === 'planeradByggstart' ? 'Planerad byggstart' : 'Klart för besiktning',
        date: empty,
      });
      setOriginalValues((prev) => ({ ...prev, ...updates }));
      setHasChangesTider(false);
      emitProjectUpdated(updatedProject);
      showSaveSuccessFeedback('Datumet har tagits bort');
    } catch (error) {
      console.error('[OversiktSummary] Error clearing date:', error);
      hideSaveFeedback();
      Alert.alert('Fel', `Kunde inte ta bort datum: ${error?.message || 'Okänt fel'}`);
    } finally {
      setSaving(false);
    }
  }, [clearConfirmField, companyId, projectId, updateProjectInHierarchy, showSavingFeedback, hideSaveFeedback, showSaveSuccessFeedback]);

  const datePickerValue = React.useMemo(() => {
    if (datePickerField === 'sistaDagForFragor') return sistaDagForFragor;
    if (datePickerField === 'anbudsinlamning') return anbudsinlamning;
    if (datePickerField === 'planeradByggstart') return planeradByggstart;
    if (datePickerField === 'klartForBesiktning') return klartForBesiktning;
    return '';
  }, [datePickerField, sistaDagForFragor, anbudsinlamning, planeradByggstart, klartForBesiktning]);

  const handleDatePicked = useCallback((iso) => {
    const next = isValidIsoDate(iso) ? String(iso) : '';
    if (!datePickerField) return;
    if (datePickerField === 'sistaDagForFragor') handleSistaDagForFragorChange(next);
    if (datePickerField === 'anbudsinlamning') handleAnbudsinlamningChange(next);
    if (datePickerField === 'planeradByggstart') handlePlaneradByggstartChange(next);
    if (datePickerField === 'klartForBesiktning') handleKlartForBesiktningChange(next);
  }, [
    datePickerField,
    handleSistaDagForFragorChange,
    handleAnbudsinlamningChange,
    handlePlaneradByggstartChange,
    handleKlartForBesiktningChange,
  ]);

  const handleAnteckningarChange = useCallback((val) => {
    setAnteckningar(val);
  }, []);

  const projectInfoDropdownOpen =
    phaseDropdownVisible || upphandlingsformDropdownVisible || entreprenadformDropdownVisible;

  const confirmPhaseChangeIfNeeded = React.useCallback(async () => {
    const fromPhase = String(originalValues.phaseKey || '').trim();
    const toPhase = String(phaseKey || '').trim();
    if (!fromPhase || !toPhase || fromPhase === toPhase) return true;

    const fromLabel = (phaseOptions || []).find((p) => p?.value === fromPhase)?.label || fromPhase;
    const toLabel = (phaseOptions || []).find((p) => p?.value === toPhase)?.label || toPhase;
    const message = `Vill du verkligen byta projektskede från "${fromLabel}" till "${toLabel}"?`;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return window.confirm(message);
    }

    return await new Promise((resolve) => {
      Alert.alert(
        'Byt projektstatus',
        message,
        [
          { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Byt', style: 'destructive', onPress: () => resolve(true) },
        ],
      );
    });
  }, [originalValues.phaseKey, phaseKey, phaseOptions]);

  return (
    <>
      <PhaseChangeLoadingModal
        visible={saveFeedback.visible}
        loadingPhase={phaseKey}
        title={saveFeedback.title}
        subtitle={saveFeedback.subtitle}
        mode={saveFeedback.mode}
      />
      <ScrollView style={styles.container}>
        <View style={styles.content}>
        {/* 1. Projektinfo and Kund & Beställare - Row 1 */}
        <View style={[styles.twoColumnRow, projectInfoDropdownOpen ? styles.twoColumnRowLifted : null]}>
          <View style={styles.columnCard}>
        <InfoCard
          title="Projektinformation"
          icon="information-circle-outline"
          hasChanges={hasChangesInfo}
              saving={saving}
          zIndex={projectInfoDropdownOpen ? 3000 : undefined}
          onSave={async () => {
            if (saving) return;

            // KRITISK: Projektnummer måste vara unikt per företag.
            // Blockera innan vi sparar/uppdaterar något.
            const beforePn = String(originalValues?.projectNumber || '').trim();
            const afterPn = String(projectNumber || '').trim();
            const normalizePn = (v) => String(v || '').trim().toLowerCase();
            if (afterPn && normalizePn(afterPn) !== normalizePn(beforePn)) {
              const cid = String(companyId || '').trim();
              const pid = String(projectId || project?.id || '').trim();
              if (cid && pid) {
                try {
                  const dup = await hasDuplicateProjectNumber(cid, afterPn, pid);
                  if (dup) {
                    Alert.alert('Fel', `Det finns redan ett projekt med projektnummer ${afterPn}. Projektnummer måste vara unikt.`);
                    return;
                  }
                } catch (_e) {
                  Alert.alert('Fel', 'Kunde inte kontrollera om projektnumret är unikt. Försök igen.');
                  return;
                }
              }
            }

            // Confirm skede change before saving
            const ok = await confirmPhaseChangeIfNeeded();
            if (!ok) return;
            
            // Validate required fields
            if (!projectNumber.trim()) {
              Alert.alert('Fel', 'Projektnummer är obligatoriskt');
              return;
            }
            if (!projectName.trim()) {
              Alert.alert('Fel', 'Projektnamn är obligatoriskt');
              return;
            }

            showSavingFeedback();
            setSaving(true);
            try {
              const updates = {
                projectNumber: projectNumber.trim(),
                projectName: projectName.trim(),
                name: projectName.trim(),
                phase: phaseKey,
                projectType: projectType.trim(),
                upphandlingsform: upphandlingsform.trim(),
              };

              console.log('[OversiktSummary] Starting save of project info:', updates);
              const updatedProject = await updateProjectInHierarchy(updates);

              const beforePn = String(originalValues?.projectNumber || '').trim();
              const beforePnm = String(originalValues?.projectName || '').trim();
              const afterPn = String(projectNumber || '').trim();
              const afterPnm = String(projectName || '').trim();
              const identityChanged = beforePn !== afterPn || beforePnm !== afterPnm;

              let siteId = String(
                project?.siteId ||
                project?.siteID ||
                project?.sharePointSiteId ||
                project?.site?.id ||
                project?.site?.siteId ||
                project?.folder?.siteId ||
                project?.folder?.siteID ||
                ''
              ).trim();
              const projectPath = String(
                project?.projectPath ||
                project?.path ||
                project?.sharePointPath ||
                project?.folder?.path ||
                project?.rootFolderPath ||
                ''
              ).trim();

              if (!siteId && projectPath && (companyId || '').trim()) {
                try {
                  const resolved = await getCompanySharePointSiteId(String(companyId || '').trim());
                  if (resolved) siteId = String(resolved).trim();
                } catch (_e) {}
              }

              let projectToEmit = updatedProject;

              if (siteId && projectPath) {
                if (identityChanged) {
                  try {
                    await renameSharePointProjectFolderAndUpdateProject(companyId || null, {
                      siteId,
                      projectPath,
                      projectId: String(projectId || project?.id || '').trim(),
                      phaseKey,
                    }, afterPn, afterPnm);
                    const cid = String(companyId || '').trim();
                    const pid = String(projectId || project?.id || '').trim();
                    if (cid && pid) {
                      const fetched = await fetchCompanyProject(cid, pid);
                      if (fetched) projectToEmit = { ...(project || {}), ...fetched };
                    }
                    console.log('[OversiktSummary] SharePoint project folder renamed and project path updated');
                  } catch (renameErr) {
                    console.error('[OversiktSummary] Failed to rename SharePoint project folder:', renameErr?.message || renameErr);
                    try {
                      Alert.alert(
                        'Projektmappen kunde inte bytas namn i SharePoint',
                        (renameErr?.message || String(renameErr || '')).trim() || 'Projektinformationen är sparad i systemet, men mappnamnet i SharePoint är oförändrat. Kontrollera behörigheter och försök igen.'
                      );
                    } catch (_e) {}
                  }
                }
                if (!identityChanged) {
                  try {
                    await patchSharePointProjectMetadata(companyId || null, {
                      companyId: companyId || undefined,
                      siteId,
                      projectPath,
                      phaseKey,
                      projectNumber: afterPn,
                      projectName: afterPnm,
                    });
                  } catch (metaErr) {
                    console.error('[OversiktSummary] Failed saving SharePoint project metadata:', metaErr?.message || metaErr);
                  }
                }
                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                  try { window.dispatchEvent(new Event('dkSharePointMetaUpdated')); } catch (_e) {}
                }
              } else if (!siteId || !projectPath) {
                console.warn('[OversiktSummary] Missing siteId/projectPath; cannot persist SharePoint metadata', {
                  companyId,
                  siteId,
                  projectPath,
                  projectKeys: Object.keys(project || {}),
                });
              }

              // Ensure display name is set so left panel and header update (fullName used by hierarchy/topbar)
              const displayFullName = (afterPn && afterPnm) ? `${afterPn} – ${afterPnm}` : (projectToEmit?.fullName || projectToEmit?.name || '');
              const projectToEmitWithDisplay = { ...projectToEmit, fullName: displayFullName, name: projectToEmit?.name || afterPnm, projectNumber: afterPn, projectName: afterPnm };

              console.log('[OversiktSummary] Project updated successfully:', { id: projectToEmitWithDisplay?.id, name: projectToEmitWithDisplay?.name, phase: projectToEmitWithDisplay?.phase });

              // Backend is source of truth: emit what Firestore returns (with display fields so left panel/header update).
              emitProjectUpdated(projectToEmitWithDisplay);

              // Best-effort: refresh FS-logg.xlsx so Excel headers reflect live metadata.
              try {
                const cid = String(companyId || '').trim();
                const pid = String(projectId || project?.id || '').trim();
                if (cid && pid && identityChanged) {
                  enqueueFsExcelSync(cid, pid, { reason: 'project-metadata-updated' });
                }
              } catch (_e) {}
              
              // Update original values and reset change flag so the yellow "changed" highlight disappears
              setOriginalValues(prev => ({
                ...prev,
                projectNumber: afterPn,
                projectName: afterPnm,
                phaseKey: phaseKey,
                projectType: projectType.trim(),
                upphandlingsform: upphandlingsform.trim(),
              }));
              setHasChangesInfo(false);
              lastSavedInfoRef.current = { projectNumber: afterPn, projectName: afterPnm };
              showSaveSuccessFeedback('Projektinformation har uppdaterats');
            } catch (error) {
              console.error('[OversiktSummary] Error saving project info:', error);
              hideSaveFeedback();
              Alert.alert('Fel', `Kunde inte spara projektinformation: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={resetInfoCardState}
        >
          <InfoRow
            key={`projektnummer-${String(originalValues.projectNumber ?? '')}`}
            label="Projektnummer"
            value={projectNumber}
            onChange={handleProjectNumberChange}
            placeholder="T.ex. 2026-001"
            originalValue={originalValues.projectNumber || ''}
          />
          <InfoRow
            key={`projektnamn-${String(originalValues.projectName ?? '')}`}
            label="Projektnamn"
            value={projectName}
            onChange={handleProjectNameChange}
            placeholder="T.ex. Opus Bilprovning"
            originalValue={originalValues.projectName || ''}
          />
          <SelectRow
            label="Skede"
            value={phaseKey}
            options={phaseOptions}
            onSelect={(val) => {
              setPhaseKey(val);
              setHasChangesInfo(true);
            }}
            placeholder="Välj projektstatus..."
            originalValue={originalValues.phaseKey || ''}
            visible={phaseDropdownVisible}
            onToggleVisible={() => setPhaseDropdownVisible(!phaseDropdownVisible)}
          />
          <SelectRow
            label="Upphandlingsform"
            value={projectType}
            options={upphandlingsformOptions}
            onSelect={handleProjectTypeChange}
            placeholder="Välj upphandlingsform..."
            originalValue={originalValues.projectType || ''}
            visible={upphandlingsformDropdownVisible}
            onToggleVisible={() => setUpphandlingsformDropdownVisible(!upphandlingsformDropdownVisible)}
            optionInfo={upphandlingsformInfo}
            onInfoPress={(infoText, optionText) => {
              // Close dropdown when opening info modal
              setUpphandlingsformDropdownVisible(false);
              setInfoTooltipText(`${optionText}: ${infoText}`);
              setInfoTooltipVisible(true);
            }}
          />
          <SelectRow
            label="Entreprenadform"
            value={upphandlingsform}
            options={entreprenadformOptions}
            onSelect={handleUpphandlingsformChange}
            placeholder="Välj entreprenadform..."
            originalValue={originalValues.upphandlingsform || ''}
            visible={entreprenadformDropdownVisible}
            onToggleVisible={() => setEntreprenadformDropdownVisible(!entreprenadformDropdownVisible)}
            optionInfo={entreprenadformInfo}
            onInfoPress={(infoText, optionText) => {
              // Close dropdown when opening info modal
              setEntreprenadformDropdownVisible(false);
              setInfoTooltipText(`${optionText}: ${infoText}`);
              setInfoTooltipVisible(true);
            }}
          />
        </InfoCard>
          </View>

          <View style={styles.columnCard}>
        <InfoCard
          title="Kund & Beställare"
          icon="person-outline"
          hasChanges={hasChangesKund}
              saving={saving}
          onSave={async () => {
            if (saving) return;
            showSavingFeedback();
            setSaving(true);
            try {
              // Tvinga uppdaterad token så att Firestore-reglerna ser senaste claims (t.ex. superadmin)
              try {
                if (auth?.currentUser?.getIdToken) await auth.currentUser.getIdToken(true);
              } catch (_) {}

              const updates = {
                kund: kund.trim(),
                organisationsnummer: organisationsnummer.trim(),
                kontaktperson,
                telefon: telefon.trim(),
                epost: epost.trim(),
                linkedKundSupplierId: linkedKundSupplierId || null,
                linkedKundCustomerId: linkedKundCustomerId || null,
              };

              const updatedProject = await updateProjectInHierarchy(updates);
              emitProjectUpdated(updatedProject);

              const orgNrTrim = organisationsnummer.trim();
              if ((linkedKundSupplierId || linkedKundCustomerId) && orgNrTrim) {
                try {
                  const cid = String(companyId || '').trim();
                  if (linkedKundSupplierId) {
                    await updateCompanySupplier({ id: linkedKundSupplierId, patch: { organizationNumber: orgNrTrim } }, cid);
                  } else if (linkedKundCustomerId) {
                    await updateCompanyCustomer({ id: linkedKundCustomerId, patch: { personalOrOrgNumber: orgNrTrim } }, cid);
                  }
                  Alert.alert('Uppdaterat', 'Org-nr uppdaterat i leverantörsregistret.');
                } catch (regErr) {
                  console.warn('[OversiktSummary] Kunde inte uppdatera org.nr i register:', regErr?.message || regErr);
                }
              }

              const savedKundValues = {
                kund: kund.trim(),
                organisationsnummer: orgNrTrim,
                kontaktperson,
                telefon: telefon.trim(),
                epost: epost.trim()
              };
              lastSavedKundRef.current = savedKundValues;
              kundJustSavedRef.current = true;
              setOriginalValues(prev => ({
                ...prev,
                ...savedKundValues
              }));
              setHasChangesKund(false);
              showSaveSuccessFeedback('Kundinformation har uppdaterats');
              setTimeout(() => { kundJustSavedRef.current = false; }, 0);
            } catch (error) {
              const isPermissionDenied = error?.code === 'permission-denied' || (error?.message && String(error.message).toLowerCase().includes('permission'));
              console.error('[OversiktSummary] Error saving kund info:', error);
              hideSaveFeedback();
              const message = isPermissionDenied
                ? 'Sparningen nekas av Firestore (behörighet). Kontrollera att Firestore-reglerna är deployade (npm run firebase:deploy:rules) och att du är medlem i projektets företag.'
                : `Kunde inte spara kundinformation: ${error.message || 'Okänt fel'}`;
              Alert.alert('Fel', message);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={resetKundCardState}
        >
          <View style={[styles.infoRow, { overflow: 'visible', position: 'relative', zIndex: companySearchOpen ? 2000 : undefined }]}>
            <Text style={styles.infoLabel}>Företag:</Text>
            <View style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'visible' }}>
              <TextInput
                value={kund}
                onChangeText={handleKundChange}
                placeholder="Skriv minst 2 tecken för att söka i leverantörs- och kundregister"
                placeholderTextColor="#94A3B8"
                style={[
                  styles.infoInput,
                  (kund.trim() !== (originalValues.kund || '').trim()) && styles.infoInputChanged,
                ]}
              />
              {companySearchLoading ? (
                <View style={{ position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#64748b' }}>Söker…</Text>
                </View>
              ) : null}
              {companySearchOpen && companySearchResults.length > 0 ? (
                <View style={[styles.dropdownList, { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 0 }]}>
                  {companySearchResults.map((company) => (
                    <Pressable
                      key={`${company.type}-${company.id}`}
                      onPress={() => handleSelectCompany(company)}
                      style={({ pressed }) => [
                        styles.dropdownItem,
                        pressed ? styles.dropdownItemSelected : null,
                      ]}
                    >
                      <Text style={styles.dropdownItemText} numberOfLines={1}>{company.name}</Text>
                      {company.organizationNumber ? (
                        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={1}>{formatOrganizationNumber(company.organizationNumber)}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
          <InfoRow
            key="organisationsnummer"
            label="Organisationsnummer"
            value={organisationsnummer}
            onChange={handleOrganisationsnummerChange}
            placeholder="Org.nr (xxxxxx-xxxx)"
            originalValue={originalValues.organisationsnummer || ''}
            transformInput={formatOrganizationNumber}
          />
          <PersonRow
            label="Kontaktperson"
            person={kontaktperson}
            onSelect={() => setKontaktpersonSelectorVisible(true)}
            onClear={() => {
              setKontaktperson(null);
              setHasChangesKund(true);
            }}
            placeholder="Välj kontaktperson..."
            hasChanged={JSON.stringify(kontaktperson) !== JSON.stringify(originalValues.kontaktperson)}
          />
          <InfoRow
            key="telefon"
            label="Telefon"
            value={telefon}
            onChange={handleTelefonChange}
            placeholder="Telefonnummer"
            originalValue={originalValues.telefon || ''}
          />
          <InfoRow
            key="epost"
            label="E-post"
            value={epost}
            onChange={handleEpostChange}
            placeholder="E-postadress"
            originalValue={originalValues.epost || ''}
          />
        </InfoCard>
          </View>
        </View>

        {/* 3. Projektadress and Viktiga datum - Row 2 */}
        <View style={styles.twoColumnRow}>
          <View style={styles.columnCard}>
        <InfoCard
          title="Projektadress"
          icon="location-outline"
          hasChanges={hasChangesAdress}
              saving={saving}
          onSave={async () => {
            if (saving) return;
            showSavingFeedback();
            setSaving(true);
            try {
              const updates = {
                adress: adress.trim(),
                kommun: kommun.trim(),
                region: region.trim(),
                fastighetsbeteckning: fastighetsbeteckning.trim(),
                latitude: latitude ?? null,
                longitude: longitude ?? null,
              };

              const updatedProject = await updateProjectInHierarchy(updates);
              emitProjectUpdated(updatedProject);

              setOriginalValues(prev => ({
                ...prev,
                adress: adress.trim(),
                kommun: kommun.trim(),
                region: region.trim(),
                fastighetsbeteckning: fastighetsbeteckning.trim(),
                latitude: latitude ?? null,
                longitude: longitude ?? null,
              }));
              setHasChangesAdress(false);
              showSaveSuccessFeedback('Adressinformation har uppdaterats');
            } catch (error) {
              console.error('[OversiktSummary] Error saving adress info:', error);
              hideSaveFeedback();
              Alert.alert('Fel', `Kunde inte spara adressinformation: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={resetAdressCardState}
        >
          {Platform.OS === 'web' ? (
            <View style={styles.addressModeRow}>
              <TouchableOpacity
                style={[styles.addressModeTab, addressMode === 'manual' && styles.addressModeTabActive]}
                onPress={() => setAddressMode('manual')}
              >
                <Ionicons name="create-outline" size={16} color={addressMode === 'manual' ? '#1976D2' : '#64748B'} />
                <Text style={[styles.addressModeTabText, addressMode === 'manual' && styles.addressModeTabTextActive]}>Manuell inskrivning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addressModeTab, addressMode === 'map' && styles.addressModeTabActive]}
                onPress={() => setAddressMode('map')}
              >
                <Ionicons name="map-outline" size={16} color={addressMode === 'map' ? '#1976D2' : '#64748B'} />
                <Text style={[styles.addressModeTabText, addressMode === 'map' && styles.addressModeTabTextActive]}>Google Maps</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {(addressMode === 'manual' || Platform.OS !== 'web') ? (
            <>
              <InfoRow
                key="adress"
                label="Adress"
                value={adress}
                onChange={handleAdressChange}
                placeholder="Gatuadress"
                originalValue={originalValues.adress || ''}
              />
              <InfoRow
                key="kommun"
                label="Ort"
                value={kommun}
                onChange={handleKommunChange}
                placeholder="Ort"
                originalValue={originalValues.kommun || ''}
              />
              <InfoRow
                key="region"
                label="Kommun"
                value={region}
                onChange={handleRegionChange}
                placeholder="Kommun"
                originalValue={originalValues.region || ''}
              />
              <InfoRow
                key="fastighetsbeteckning"
                label="Fastighet"
                value={fastighetsbeteckning}
                onChange={handleFastighetsbeteckningChange}
                placeholder="Fastighetsbeteckning"
                originalValue={originalValues.fastighetsbeteckning || ''}
              />
            </>
          ) : (
            <ProjectAddressMap
              latitude={latitude}
              longitude={longitude}
              onAddressFromMap={handleAddressFromMap}
              height={280}
              placeholder="Sök adress eller plats..."
            />
          )}
        </InfoCard>
          </View>

          <View style={styles.columnCard}>
        <InfoCard
          title="Viktiga datum"
          icon="calendar-outline"
          hasChanges={hasChangesTider}
              saving={saving}
          onSave={async () => {
            if (saving) return;
            showSavingFeedback();
            setSaving(true);
            try {
              const updates = {
                sistaDagForFragor: sistaDagForFragor.trim(),
                anbudsinlamning: anbudsinlamning.trim(),
                planeradByggstart: planeradByggstart.trim(),
                klartForBesiktning: klartForBesiktning.trim(),
              };

              // Canonical persistent keys (required by architecture).
              const canonical = {
                lastQuestionDate: updates.sistaDagForFragor,
                tenderSubmissionDate: updates.anbudsinlamning,
                plannedConstructionStart: updates.planeradByggstart,
                readyForInspectionDate: updates.klartForBesiktning,
              };

              // Backwards-compatible mirroring for any legacy readers in the app.
              const legacyMirror = {
                anbudstid: updates.anbudsinlamning,
                byggstart: updates.planeradByggstart,
                fardigstallning: updates.klartForBesiktning,
              };

              // Persist (Firestore) via the same flow as the rest of Projektinformation.
              const updatedProject = await updateProjectInHierarchy({ ...canonical, ...updates, ...legacyMirror });

              // One-way sync into Tidsplan as locked milestones (no duplicates).
              try {
                if (companyId && projectId) {
                  await upsertProjectInfoTimelineMilestone(companyId, projectId, {
                    key: 'sista-dag-for-fragor',
                    title: 'Sista dag för frågor',
                    date: updates.sistaDagForFragor,
                  });
                  await upsertProjectInfoTimelineMilestone(companyId, projectId, {
                    key: 'anbudsinlamning',
                    title: 'Anbudsinlämning',
                    date: updates.anbudsinlamning,
                  });
                  await upsertProjectInfoTimelineMilestone(companyId, projectId, {
                    key: 'planerad-byggstart',
                    title: 'Planerad byggstart',
                    date: updates.planeradByggstart,
                  });
                  await upsertProjectInfoTimelineMilestone(companyId, projectId, {
                    key: 'klart-for-besiktning',
                    title: 'Klart för besiktning',
                    date: updates.klartForBesiktning,
                  });
                }
              } catch (syncErr) {
                console.warn('[OversiktSummary] Warning syncing important dates to timeline:', syncErr?.message || syncErr);
              }

              emitProjectUpdated(updatedProject);
              
              setOriginalValues(prev => ({
                ...prev,
                sistaDagForFragor: sistaDagForFragor.trim(),
                anbudsinlamning: anbudsinlamning.trim(),
                planeradByggstart: planeradByggstart.trim(),
                klartForBesiktning: klartForBesiktning.trim(),
              }));
              setHasChangesTider(false);
              showSaveSuccessFeedback('Datuminformation har uppdaterats');
            } catch (error) {
              console.error('[OversiktSummary] Error saving tider info:', error);
              hideSaveFeedback();
              Alert.alert('Fel', `Kunde inte spara datuminformation: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={resetTiderCardState}
        >
          <DateRow
            key="sistaDagForFragor"
            label="Sista dag för frågor"
            value={sistaDagForFragor}
            originalValue={originalValues.sistaDagForFragor || ''}
            placeholder="YYYY-MM-DD"
            onOpen={() => openDatePicker('sistaDagForFragor')}
            onClear={sistaDagForFragor ? () => requestClearDate('sistaDagForFragor') : undefined}
          />
          <DateRow
            key="anbudsinlamning"
            label="Anbudsinlämning"
            value={anbudsinlamning}
            originalValue={originalValues.anbudsinlamning || ''}
            placeholder="YYYY-MM-DD"
            onOpen={() => openDatePicker('anbudsinlamning')}
            onClear={anbudsinlamning ? () => requestClearDate('anbudsinlamning') : undefined}
          />
          <DateRow
            key="planeradByggstart"
            label="Planerad byggstart"
            value={planeradByggstart}
            originalValue={originalValues.planeradByggstart || ''}
            placeholder="YYYY-MM-DD"
            onOpen={() => openDatePicker('planeradByggstart')}
            onClear={planeradByggstart ? () => requestClearDate('planeradByggstart') : undefined}
          />
          <DateRow
            key="klartForBesiktning"
            label="Klart för besiktning"
            value={klartForBesiktning}
            originalValue={originalValues.klartForBesiktning || ''}
            placeholder="YYYY-MM-DD"
            onOpen={() => openDatePicker('klartForBesiktning')}
            onClear={klartForBesiktning ? () => requestClearDate('klartForBesiktning') : undefined}
          />
        </InfoCard>
          </View>
        </View>

        {/* 4. Anteckningar - Full width at bottom */}
        <InfoCard
          title="Anteckningar"
          icon="document-text-outline"
          hasChanges={hasChangesAnteckningar}
          saving={saving}
          onSave={async () => {
            if (saving) return;
            showSavingFeedback();
            setSaving(true);
            try {
              const updates = {
                anteckningar: anteckningar.trim()
              };

              const updatedProject = await updateProjectInHierarchy(updates);
              emitProjectUpdated(updatedProject);
              
              setOriginalValues(prev => ({
                ...prev,
                anteckningar: anteckningar.trim()
              }));
              setHasChangesAnteckningar(false);
              showSaveSuccessFeedback('Anteckningar har uppdaterats');
            } catch (error) {
              console.error('[OversiktSummary] Error saving anteckningar:', error);
              hideSaveFeedback();
              Alert.alert('Fel', `Kunde inte spara anteckningar: ${error.message || 'Okänt fel'}`);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={resetAnteckningarCardState}
        >
          <AnteckningarInput
            value={anteckningar}
            onChange={handleAnteckningarChange}
            placeholder="Lägg till anteckningar om projektet..."
            originalValue={originalValues.anteckningar || ''}
          />
        </InfoCard>
      </View>

      {/* Person Selector Modals */}
      <PersonSelector
        visible={kontaktpersonSelectorVisible}
        onClose={() => setKontaktpersonSelectorVisible(false)}
        onSelect={(person) => {
          setKontaktperson(person);
          // Auto-fill email and phone if available
          if (person && person.email) {
            setEpost(person.email);
          }
          if (person && person.phone) {
            setTelefon(person.phone);
          }
          setHasChangesKund(checkKundChanges());
        }}
        companyId={companyId}
        value={kontaktperson}
        label="Välj kontaktperson"
      />

      <IsoDatePickerModal
        visible={datePickerVisible}
        title="Välj datum"
        value={datePickerValue}
        onSelect={handleDatePicked}
        onClose={closeDatePicker}
        onDelete={
          datePickerField && datePickerValue
            ? () => {
                closeDatePicker();
                requestClearDate(datePickerField);
              }
            : undefined
        }
      />

      <ConfirmModal
        visible={!!clearConfirmField}
        message={
          clearConfirmField
            ? hasOutlookForField(clearConfirmField)
              ? 'Du har skickat ut en Outlook-kallelse för detta datum. Glöm inte att radera eller avboka den i Outlook (t.ex. under Tidsplan och viktiga datum).\n\nVill du tömma datumet?'
              : 'Vill du tömma detta datum?'
            : ''
        }
        cancelLabel="Avbryt"
        confirmLabel="Töm datum"
        danger
        onCancel={() => setClearConfirmField(null)}
        onConfirm={performClearDate}
        compact
      />

      {/* Info Tooltip Modal - Rendered after dropdown modals to appear on top */}
      <Modal
        visible={infoTooltipVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setInfoTooltipVisible(false)}
        presentationStyle="overFullScreen"
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            zIndex: 9999999, // Higher than dropdown to appear on top
            ...(Platform.OS === 'web' ? {
              zIndex: 9999999,
            } : {}),
          }}
          activeOpacity={1}
          onPress={() => setInfoTooltipVisible(false)}
        >
          <TouchableOpacity
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: 20,
              maxWidth: 400,
              width: '100%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 12,
              elevation: 30, // Higher than dropdown elevation
              zIndex: 9999999,
              ...(Platform.OS === 'web' ? {
                zIndex: 9999999,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              } : {}),
            }}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
              <Ionicons name="information-circle" size={24} color="#1976D2" style={{ marginRight: 12, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 8 }}>
                  Information
                </Text>
                <Text style={{ fontSize: 14, color: '#475569', lineHeight: 20 }}>
                  {infoTooltipText}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setInfoTooltipVisible(false)}
                style={{
                  padding: 4,
                  marginLeft: 8,
                  ...(Platform.OS === 'web' ? {
                    cursor: 'pointer',
                  } : {}),
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setInfoTooltipVisible(false)}
              style={{
                backgroundColor: '#1976D2',
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
                alignItems: 'center',
                marginTop: 8,
                ...(Platform.OS === 'web' ? {
                  cursor: 'pointer',
                } : {}),
              }}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Stäng</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  content: {
    padding: 24,
    paddingBottom: 80 // Increased bottom padding for spacing after Anteckningar
  },
  // Two column layout
  twoColumnRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
    position: 'relative',
    overflow: 'visible',
    zIndex: 0,
  },
  twoColumnRowLifted: {
    zIndex: 5000,
  },
  columnCard: {
    flex: 1,
    minWidth: 0, // Allow flex items to shrink below their content size
    alignSelf: 'stretch', // Make cards equal height
    position: 'relative',
    overflow: 'visible',
  },
  // Card styles
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    flex: 1,
    minWidth: 0, // Allow card to shrink when panels are open
    flexDirection: 'column',
    overflow: 'visible', // Allow dropdown to extend outside card
    position: 'relative',
  },
  cardHasChanges: {
    borderColor: '#FFA726',
    borderWidth: 2,
    backgroundColor: '#FFF8E1'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  cardIcon: {
    marginRight: 8
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222'
  },
  changesIndicator: {
    marginLeft: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFA726'
  },
  changesIndicatorText: {
    fontSize: 12,
    color: '#FFA726',
    fontWeight: 'bold'
  },
  editButton: {
    padding: 6
  },
  editActions: {
    flexDirection: 'row',
    gap: 8
  },
  saveButton: {
    backgroundColor: '#1976D2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  saveButtonDisabled: {
    opacity: 0.6
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14
  },
  cardContent: {
    padding: 16,
    flex: 1,
    minWidth: 0, // Allow content to shrink so inputs stay within card
    overflow: 'visible',
    position: 'relative',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start'
  },
  infoRowChanged: {
    backgroundColor: '#FFF8E1',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    width: 160,
    fontWeight: '600'
  },
  infoValue: {
    fontSize: 14,
    color: '#222',
    flex: 1
  },
  infoInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    fontSize: 14,
    color: '#222',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#fff'
  },
  infoInputChanged: {
    borderColor: '#FFA726',
    borderWidth: 2,
    backgroundColor: '#FFF8E1'
  },
  infoInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top'
  },
  // Person selector styles
  personSelectorButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff'
  },
  personSelectorButtonChanged: {
    borderColor: '#FFA726',
    borderWidth: 2,
    backgroundColor: '#FFF8E1'
  },
  personActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10
  },
  personClearButton: {
    padding: 2
  },
  personInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  personIcon: {
    marginTop: 2
  },
  personDetails: {
    flex: 1,
    flexDirection: 'column',
    gap: 2
  },
  personName: {
    fontSize: 14,
    color: '#222',
    fontWeight: '500'
  },
  personPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 2
  },
  personEmail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2
  },
  personPlaceholder: {
    fontSize: 14,
    color: '#999',
    flex: 1
  },
  addressModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  addressModeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  addressModeTabActive: {
    borderColor: '#1976D2',
    backgroundColor: '#E3F2FD',
  },
  addressModeTabText: {
    fontSize: 13,
    color: '#64748B',
  },
  addressModeTabTextActive: {
    color: '#1976D2',
    fontWeight: '500',
  },
  // Dropdown styles – aligned with leftNavTheme/topbar (accent #2563EB, hover/active backgrounds)
  dropdownList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderTopWidth: 0,
    borderRadius: 8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: 280,
    overflow: 'scroll',
    zIndex: 6001,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
      zIndex: 6001,
      overflowY: 'auto',
      maxHeight: '280px',
    } : {}),
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownItemSelected: {
    backgroundColor: '#EEF4FF',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#1e293b',
  },
  dropdownItemTextSelected: {
    color: '#2563EB',
    fontWeight: '600',
  },
  // Anteckningar styles
  anteckningarContainer: {
    width: '100%'
  },
  anteckningarInput: {
    width: '100%',
    minHeight: 150,
    fontSize: 14,
    color: '#222',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
    maxHeight: 600 // Maximum height before scrolling
  },
  anteckningarInputChanged: {
    borderColor: '#FFA726',
    borderWidth: 2,
    backgroundColor: '#FFF8E1'
  }
});

// InfoCard component - defined at module level to prevent re-creation on every render
const InfoCard = React.memo(({ title, icon, children, hasChanges, onSave, onCancel, saving, zIndex }) => (
  <View
    style={[
      styles.card,
      hasChanges && styles.cardHasChanges,
      zIndex != null ? { zIndex, elevation: zIndex } : null,
    ]}
  >
    <View style={styles.cardHeader}>
      <View style={styles.cardTitleRow}>
        <Ionicons name={icon} size={20} color="#1976D2" style={styles.cardIcon} />
        <Text style={styles.cardTitle}>{title}</Text>
        {hasChanges && (
          <View style={styles.changesIndicator}>
            <Text style={styles.changesIndicatorText}>•</Text>
          </View>
        )}
      </View>
      {hasChanges && (
        <View style={styles.editActions}>
          <TouchableOpacity 
            onPress={onSave} 
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Sparar...' : 'Spara'}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={onCancel} 
            style={styles.cancelButton}
            disabled={saving}
          >
            <Text style={styles.cancelButtonText}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
    <View style={styles.cardContent}>
      {children}
    </View>
  </View>
));

InfoCard.displayName = 'InfoCard';

// InfoRow component - defined at module level to prevent re-creation on every render
// Completely uncontrolled - maintains its own state to prevent focus loss
// transformInput: optional (v) => formattedValue – e.g. for org.nr xxxxxx-xxxx; both display and onChange use transformed value
const InfoRow = ({ label, value, onChange, placeholder, multiline = false, originalValue = '', transformInput }) => {
  const initial = transformInput ? transformInput(String(value || '')) : String(value || '');
  const [localValue, setLocalValue] = React.useState(() => initial);
  const isFocusedRef = React.useRef(false);
  const prevValueRef = React.useRef(value);
  
  // Only update local value if prop value changed externally (not from our onChange)
  React.useEffect(() => {
    if (!isFocusedRef.current && prevValueRef.current !== value) {
      const next = transformInput ? transformInput(String(value || '')) : String(value || '');
      setLocalValue(next);
      prevValueRef.current = value;
    }
  }, [value, transformInput]);
  
  const handleChangeText = React.useCallback((text) => {
    const next = transformInput ? transformInput(text) : text;
    setLocalValue(next);
    onChange(next);
  }, [onChange, transformInput]);
  
  const handleFocus = React.useCallback(() => {
    isFocusedRef.current = true;
  }, []);
  
  const handleBlur = React.useCallback(() => {
    isFocusedRef.current = false;
    // Update prevValueRef to current prop value on blur
    prevValueRef.current = value;
  }, [value]);
  
  const originalString = String(originalValue || '');
  const hasChanged = localValue.trim() !== originalString.trim();
  
  return (
    <View style={[styles.infoRow, hasChanged && styles.infoRowChanged]}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <TextInput
        value={localValue}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        style={[styles.infoInput, multiline && styles.infoInputMultiline, hasChanged && styles.infoInputChanged]}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
      />
    </View>
  );
};

// DateRow component - opens a calendar and stores ISO YYYY-MM-DD; optional onClear shows kryss to töm datum
const DateRow = ({ label, value, placeholder, originalValue = '', onOpen, onClear }) => {
  const displayValue = isValidIsoDate(value) ? String(value) : '';
  const hasChanged = String(displayValue || '').trim() !== String(originalValue || '').trim();
  const showClear = onClear && displayValue;

  return (
    <View style={[styles.infoRow, hasChanged && styles.infoRowChanged]}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <View style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <TouchableOpacity
          onPress={onOpen}
          activeOpacity={0.8}
          style={{ flex: 1, minWidth: 0 }}
        >
          <TextInput
            value={displayValue}
            placeholder={placeholder}
            editable={false}
            pointerEvents="none"
            style={[styles.infoInput, hasChanged && styles.infoInputChanged, { paddingRight: showClear ? 76 : 40 }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </TouchableOpacity>
        {showClear ? (
          <TouchableOpacity
            onPress={(e) => {
              e?.stopPropagation?.();
              onClear();
            }}
            activeOpacity={0.7}
            style={{
              position: 'absolute',
              right: 40,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 6,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            }}
          >
            <Ionicons name="close-circle-outline" size={20} color="#64748B" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onOpen}
          activeOpacity={0.7}
          style={{
            position: 'absolute',
            right: 8,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 8,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          }}
        >
          <Ionicons name="calendar-outline" size={18} color="#64748B" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// AnteckningarInput component - large text area for notes
const AnteckningarInput = ({ value, onChange, placeholder, originalValue = '' }) => {
  // Use local state to maintain value while user is typing
  const [localValue, setLocalValue] = React.useState(() => String(value || ''));
  const [height, setHeight] = React.useState(150); // Start with minHeight
  const isFocusedRef = React.useRef(false);
  const prevValueRef = React.useRef(value);
  
  // Only update local value if prop value changed externally (not from our onChange)
  React.useEffect(() => {
    if (!isFocusedRef.current && prevValueRef.current !== value) {
      setLocalValue(String(value || ''));
      prevValueRef.current = value;
    }
  }, [value]);
  
  const handleChangeText = React.useCallback((text) => {
    setLocalValue(text);
    onChange(text);
  }, [onChange]);
  
  const handleFocus = React.useCallback(() => {
    isFocusedRef.current = true;
  }, []);
  
  const handleBlur = React.useCallback(() => {
    isFocusedRef.current = false;
    prevValueRef.current = value;
  }, [value]);
  
  const handleContentSizeChange = React.useCallback((event) => {
    const contentHeight = event.nativeEvent.contentSize.height;
    const calculatedHeight = Math.max(150, contentHeight + 24); // minHeight 150, add padding
    const maxAllowedHeight = 600; // Maximum height before scrolling
    
    // Only update height if content actually exceeds current visible area
    // Don't shrink below minimum, but allow growth when content exceeds current height
    if (calculatedHeight > height) {
      // Content exceeds current height - grow to fit (but max at 600)
      setHeight(Math.min(calculatedHeight, maxAllowedHeight));
    }
    // If content shrinks, keep current height (don't shrink dynamically)
  }, [height]);
  
  const hasChanged = localValue.trim() !== String(originalValue || '').trim();
  
  return (
    <View style={styles.anteckningarContainer}>
      <TextInput
        value={localValue}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onContentSizeChange={handleContentSizeChange}
        placeholder={placeholder}
        style={[
          styles.anteckningarInput,
          { height },
          hasChanged && styles.anteckningarInputChanged
        ]}
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
};

// PersonRow component - defined at module level to prevent re-creation on every render
const PersonRow = React.memo(({ label, person, onSelect, onClear, placeholder, hasChanged = false }) => {
  return (
    <View style={[styles.infoRow, hasChanged && styles.infoRowChanged]}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <TouchableOpacity
        style={[styles.personSelectorButton, hasChanged && styles.personSelectorButtonChanged]}
        onPress={onSelect}
      >
        {person ? (
          <View style={styles.personInfo}>
            <Ionicons 
              name={person.type === 'user' ? 'person-circle-outline' : 'person-outline'} 
              size={20} 
              color={person.type === 'user' ? '#1976D2' : '#FF9800'} 
              style={styles.personIcon}
            />
            <View style={styles.personDetails}>
              <Text style={styles.personName}>{person.name}</Text>
              {person.phone && (
                <Text style={styles.personPhone}>{person.phone}</Text>
              )}
              {person.email && (
                <Text style={styles.personEmail}>{person.email}</Text>
              )}
            </View>
          </View>
        ) : (
          <Text style={styles.personPlaceholder}>{placeholder}</Text>
        )}
        <View style={styles.personActions}>
          {person && typeof onClear === 'function' ? (
            <Pressable
              onPress={(e) => {
                try {
                  e?.stopPropagation?.();
                } catch (_err) {}
                onClear();
              }}
              hitSlop={10}
              style={[
                styles.personClearButton,
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
              ]}
            >
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </Pressable>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </View>
      </TouchableOpacity>
    </View>
  );
});

PersonRow.displayName = 'PersonRow';

// InfoTooltip component - shows info icon with description
const InfoTooltip = ({ info, onPress }) => {
  if (!info) return null;
  
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        marginLeft: 6,
        padding: 4,
        ...(Platform.OS === 'web' ? {
          cursor: 'pointer',
        } : {}),
      }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
    >
      <Ionicons name="information-circle-outline" size={16} color="#94A3B8" />
    </TouchableOpacity>
  );
};

// SelectRow component - dropdown with options like the design from image 1
const SelectRow = ({ label, value, options, onSelect, placeholder, originalValue = '', visible, onToggleVisible, optionInfo = {}, onInfoPress }) => {
  const hasChanged = String(value || '').trim() !== String(originalValue || '').trim();

  const selectedOption = React.useMemo(() => {
    try {
      const v = value;
      const found = (options || []).find((opt) => {
        if (opt && typeof opt === 'object') return opt.value === v;
        return opt === v;
      });
      return found || null;
    } catch (_e) {
      return null;
    }
  }, [options, value]);

  const displayValue = React.useMemo(() => {
    try {
      const found = selectedOption;
      if (found && typeof found === 'object') return found.label || String(found.value || '');
      return value != null ? String(value) : '';
    } catch (_e) {
      return value != null ? String(value) : '';
    }
  }, [selectedOption, value]);

  const selectedColor = (selectedOption && typeof selectedOption === 'object' && selectedOption.color)
    ? String(selectedOption.color)
    : null;

  return (
    <View
      style={[
        styles.infoRow,
        hasChanged && styles.infoRowChanged,
        {
          overflow: 'visible',
          position: 'relative',
          ...(visible ? { zIndex: 2000 } : {}),
        },
      ]}
    >
      <Text style={styles.infoLabel}>{label}:</Text>
      <View style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'visible' }}>
        {selectedColor && !!displayValue ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 12,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: selectedColor,
              }}
            />
          </View>
        ) : null}
        <SelectDropdown
          value={value}
          options={options}
          placeholder={placeholder}
          visible={visible}
          onToggleVisible={onToggleVisible}
          onSelect={onSelect}
          fieldStyle={[
            styles.infoInput,
            hasChanged && styles.infoInputChanged,
            { paddingRight: 35, paddingLeft: selectedColor && !!displayValue ? 34 : undefined },
          ]}
          listStyle={styles.dropdownList}
          itemStyle={styles.dropdownItem}
          itemSelectedStyle={styles.dropdownItemSelected}
          itemTextStyle={styles.dropdownItemText}
          itemTextSelectedStyle={styles.dropdownItemTextSelected}
          renderOptionRight={(option) => {
            const labelText = option && typeof option === 'object' ? option.label || option.value : option;
            const infoText = optionInfo[labelText];
            if (!infoText || !onInfoPress) return null;
            return (
              <InfoTooltip
                info={infoText}
                onPress={(e) => {
                  if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                  if (infoText && onInfoPress) onInfoPress(infoText, labelText);
                }}
              />
            );
          }}
        />
      </View>
    </View>
  );
};
