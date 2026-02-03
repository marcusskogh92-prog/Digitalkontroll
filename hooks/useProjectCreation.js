import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform } from 'react-native';
import { fetchCompanyMembers } from '../components/firebase';
import { DEFAULT_PHASE } from '../features/projects/constants';

export function useProjectCreation({
  auth,
  hierarchy,
  setHierarchy,
  hierarchyRef,
  companyId,
  isBrowserEnv,
}) {

  // State for new project modal (native)
  const [newProjectModal, setNewProjectModal] = useState({ visible: false, parentSubId: null });
  // State for simple project modal (kalkylskede)
  const [simpleProjectModal, setSimpleProjectModal] = useState({ visible: false, parentSubId: null, parentMainId: null });
  const [simpleProjectSuccessModal, setSimpleProjectSuccessModal] = useState(false);
  const simpleProjectCreatedRef = useRef(null);
  // Inline project creation (web)
  const [creatingProjectInline, setCreatingProjectInline] = useState(null);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectNumber, setNewProjectNumber] = useState('');
  const [newProjectPhase, setNewProjectPhase] = useState(DEFAULT_PHASE);

  const [newProjectCustomer, setNewProjectCustomer] = useState('');
  const [newProjectClientContactName, setNewProjectClientContactName] = useState('');
  const [newProjectClientContactPhone, setNewProjectClientContactPhone] = useState('');
  const [newProjectClientContactEmail, setNewProjectClientContactEmail] = useState('');
  const [newProjectAddressStreet, setNewProjectAddressStreet] = useState('');
  const [newProjectAddressPostal, setNewProjectAddressPostal] = useState('');
  const [newProjectAddressCity, setNewProjectAddressCity] = useState('');
  const [newProjectPropertyDesignation, setNewProjectPropertyDesignation] = useState('');
  const [newProjectParticipantsSearch, setNewProjectParticipantsSearch] = useState('');
  const [newProjectAdvancedOpen, setNewProjectAdvancedOpen] = useState(false);

  const [focusedInput, setFocusedInput] = useState(null);
  const [hoveredSkyddsrondBtn, setHoveredSkyddsrondBtn] = useState(false);

  const [newProjectResponsible, setNewProjectResponsible] = useState(null);
  const [responsiblePickerVisible, setResponsiblePickerVisible] = useState(false);
  const [newProjectParticipants, setNewProjectParticipants] = useState([]);
  const [participantsPickerVisible, setParticipantsPickerVisible] = useState(false);
  const [companyAdmins, setCompanyAdmins] = useState([]);
  const [loadingCompanyAdmins, setLoadingCompanyAdmins] = useState(false);
  const [newProjectKeyboardLockHeight, setNewProjectKeyboardLockHeight] = useState(0);
  const [, setCompanyAdminsLastFetchAt] = useState(0);
  const companyAdminsUnsubRef = useRef(null);
  const [companyAdminsPermissionDenied, setCompanyAdminsPermissionDenied] = useState(false);
  const [responsibleDropdownOpen, setResponsibleDropdownOpen] = useState(false);
  const responsibleDropdownRef = useRef(null);

  const [nativeKeyboardHeight, setNativeKeyboardHeight] = useState(0);
  const nativeKeyboardHeightRef = useRef(0);

  const [companyMembers, setCompanyMembers] = useState([]);
  const [loadingCompanyMembers, setLoadingCompanyMembers] = useState(false);
  const [companyMembersPermissionDenied, setCompanyMembersPermissionDenied] = useState(false);

  const [newProjectSkyddsrondEnabled, setNewProjectSkyddsrondEnabled] = useState(false);
  const [newProjectSkyddsrondWeeks, setNewProjectSkyddsrondWeeks] = useState(2);
  const [newProjectSkyddsrondFirstDueDate, setNewProjectSkyddsrondFirstDueDate] = useState('');
  const [skyddsrondWeeksPickerVisible, setSkyddsrondWeeksPickerVisible] = useState(false);

  const [creatingProject, setCreatingProject] = useState(false);

  // Native keyboard handling for project modal
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subs = [];
    const onShow = (e) => {
      const h = e?.endCoordinates?.height || 0;
      nativeKeyboardHeightRef.current = h;
      setNativeKeyboardHeight(h);
    };
    const onHide = () => {
      nativeKeyboardHeightRef.current = 0;
      setNativeKeyboardHeight(0);
    };

    subs.push(Keyboard.addListener('keyboardWillShow', onShow));
    subs.push(Keyboard.addListener('keyboardWillHide', onHide));
    subs.push(Keyboard.addListener('keyboardDidShow', onShow));
    subs.push(Keyboard.addListener('keyboardDidHide', onHide));

    return () => {
      for (const s of subs) {
        try { s.remove(); } catch (_e) {}
      }
    };
  }, []);

  const resetProjectFields = useCallback(() => {
    try { setNewProjectPhase(DEFAULT_PHASE); } catch (_e) {}
    try { setNewProjectName(''); } catch (_e) {}
    try { setNewProjectNumber(''); } catch (_e) {}
    try { setNewProjectCustomer(''); } catch (_e) {}
    try { setNewProjectClientContactName(''); } catch (_e) {}
    try { setNewProjectClientContactPhone(''); } catch (_e) {}
    try { setNewProjectClientContactEmail(''); } catch (_e) {}
    try { setNewProjectAddressStreet(''); } catch (_e) {}
    try { setNewProjectAddressPostal(''); } catch (_e) {}
    try { setNewProjectAddressCity(''); } catch (_e) {}
    try { setNewProjectPropertyDesignation(''); } catch (_e) {}
    try { setNewProjectParticipantsSearch(''); } catch (_e) {}
    try { setNewProjectAdvancedOpen(false); } catch (_e) {}
    try { setNewProjectResponsible(null); } catch (_e) {}
    try { setResponsiblePickerVisible(false); } catch (_e) {}
    try { setNewProjectKeyboardLockHeight(0); } catch (_e) {}
    try { setNewProjectSkyddsrondEnabled(false); } catch (_e) {}
    try { setNewProjectSkyddsrondWeeks(2); } catch (_e) {}
    try { setNewProjectSkyddsrondFirstDueDate(''); } catch (_e) {}
    try { setSkyddsrondWeeksPickerVisible(false); } catch (_e) {}
    try { setNewProjectParticipants([]); } catch (_e) {}
    try { setParticipantsPickerVisible(false); } catch (_e) {}
    try { setCreatingProject(false); } catch (_e) {}
    try { setFocusedInput(null); } catch (_e) {}
    try { setHoveredSkyddsrondBtn(false); } catch (_e) {}
    try { setResponsibleDropdownOpen(false); } catch (_e) {}
  }, []);

  const newProjectSkyddsrondFirstDueValid = useMemo(() => {
    try {
      if (!newProjectSkyddsrondEnabled) return true;
      const v = String(newProjectSkyddsrondFirstDueDate || '').trim();
      if (!v) return false;
      const m = /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (!m) return false;
      const d = new Date(v);
      return !isNaN(d.getTime());
    } catch (_e) {
      return false;
    }
  }, [newProjectSkyddsrondEnabled, newProjectSkyddsrondFirstDueDate]);

  const isProjectNumberUnique = useCallback((n) => {
    try {
      if (!hierarchyRef.current || !Array.isArray(hierarchyRef.current)) return true;

      const projects = [];
      const walk = (items) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
          if (item && (item.type === 'project' || item.type === 'simpleProject')) {
            projects.push(item);
          }
          if (item && Array.isArray(item.children) && item.children.length) {
            walk(item.children);
          }
        }
      };

      walk(hierarchyRef.current);

      if (projects.some(proj => String(proj.id) === String(n))) {
        return false;
      }
    } catch (_e) {}
    return true;
  }, [hierarchyRef]);

  const canCreateProject = useMemo(() => {
    return (
      String(newProjectName ?? '').trim() !== '' &&
      String(newProjectNumber ?? '').trim() !== '' &&
      isProjectNumberUnique(newProjectNumber) &&
      !!newProjectResponsible &&
      !!newProjectSkyddsrondFirstDueValid
    );
  }, [newProjectName, newProjectNumber, newProjectResponsible, newProjectSkyddsrondFirstDueValid, isProjectNumberUnique]);

  const canCreateSimpleProject = useMemo(() => {
    return (
      String(newProjectName ?? '').trim() !== '' &&
      String(newProjectNumber ?? '').trim() !== '' &&
      isProjectNumberUnique(newProjectNumber)
    );
  }, [newProjectName, newProjectNumber, isProjectNumberUnique]);

  // Close dropdown on outside click (web)
  useEffect(() => {
    if (!isBrowserEnv || !responsibleDropdownOpen) return;

    const handleClickOutside = (e) => {
      if (responsibleDropdownRef.current && !responsibleDropdownRef.current.contains(e.target)) {
        setResponsibleDropdownOpen(false);
      }
    };

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [responsibleDropdownOpen, isBrowserEnv]);

  // Close dropdown when modal closes
  useEffect(() => {
    if (!newProjectModal.visible) {
      setResponsibleDropdownOpen(false);
    }
  }, [newProjectModal.visible]);

  // Keyboard shortcuts on web (submit/escape)
  useEffect(() => {
    if (!isBrowserEnv || !newProjectModal.visible) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (canCreateProject && !creatingProject) {
          setTimeout(() => {
            try {
              const buttons = Array.from(document.querySelectorAll('button, [role="button"], [data-create-project-btn]'));
              const createBtn = buttons.find(b => {
                const text = b.textContent || b.innerText || '';
                return text.includes('Skapa') && !b.disabled && !b.hasAttribute('disabled');
              });
              if (createBtn) createBtn.click();
            } catch (_e) {}
          }, 10);
        }
      } else if (e.key === 'Escape') {
        if (responsibleDropdownOpen) {
          setResponsibleDropdownOpen(false);
          e.preventDefault();
        } else if (!creatingProject) {
          setNewProjectModal({ visible: false, parentSubId: null });
          resetProjectFields();
        }
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [newProjectModal.visible, canCreateProject, creatingProject, isBrowserEnv, responsibleDropdownOpen, resetProjectFields]);

  // Load company admins (for responsible dropdown)
  const loadCompanyAdmins = useCallback(async ({ force } = { force: false }) => {
    if (!newProjectModal.visible && !responsibleDropdownOpen && !force) return;
    if (!companyId) {
      setCompanyAdmins([]);
      setCompanyAdminsPermissionDenied(false);
      return;
    }

    setLoadingCompanyAdmins(true);
    setCompanyAdminsPermissionDenied(false);
    try {
      const [admins, superadmins] = await Promise.all([
        fetchCompanyMembers(companyId, { role: 'admin' }),
        fetchCompanyMembers(companyId, { role: 'superadmin' }),
      ]);
      const allAdmins = [
        ...(Array.isArray(admins) ? admins : []),
        ...(Array.isArray(superadmins) ? superadmins : []),
      ];
      const uniqueAdmins = allAdmins.filter((m, idx, arr) => arr.findIndex(x => x.id === m.id) === idx);
      setCompanyAdmins(uniqueAdmins);
      setCompanyAdminsLastFetchAt(Date.now());
      setCompanyAdminsPermissionDenied(false);
    } catch (e) {
      const msg = String(e?.message || e || '').toLowerCase();
      if (e?.code === 'permission-denied' || msg.includes('permission')) {
        setCompanyAdminsPermissionDenied(true);
      }
      setCompanyAdmins([]);
    } finally {
      setLoadingCompanyAdmins(false);
    }
  }, [companyId, newProjectModal.visible, responsibleDropdownOpen, fetchCompanyMembers]);

  // Simple project creation
  const handleCreateSimpleProject = useCallback(async (selectedPhase) => {
    if (creatingProject || !canCreateSimpleProject) return;
    setCreatingProject(true);
    try {
      const projectId = String(newProjectNumber ?? '').trim();
      const projectName = String(newProjectName ?? '').trim();
      const parentSubId = simpleProjectModal.parentSubId;
      const parentMainId = simpleProjectModal.parentMainId;
      let mainId = parentMainId || null;

      if (!parentSubId) {
        setCreatingProject(false);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert('Projekt måste skapas i en undermapp. Skapa en undermapp först genom att högerklicka på huvudmappen och välja "Lägg till undermapp".');
        } else {
          Alert.alert('Fel', 'Projekt måste skapas i en undermapp. Skapa en undermapp först.');
        }
        return;
      }

      setHierarchy(prev => {
        const updated = prev.map(main => {
          if (parentMainId && main.id !== parentMainId) return main;
          return {
            ...main,
            children: main.children.map(sub =>
              sub.id === parentSubId
                ? {
                    ...sub,
                    children: [
                      ...(sub.children || []),
                      {
                        id: projectId,
                        name: projectName,
                        type: 'project',
                        phase: selectedPhase || DEFAULT_PHASE,
                        createdAt: new Date().toISOString(),
                        createdBy: auth?.currentUser?.email || '',
                      },
                    ],
                  }
                : sub,
            ),
          };
        });

        if (!mainId) {
          for (const main of updated) {
            for (const sub of main.children || []) {
              if (sub.id === parentSubId) {
                mainId = main.id;
                break;
              }
            }
            if (mainId) break;
          }
        }

        return updated;
      });

      simpleProjectCreatedRef.current = { projectId, projectName, mainId, subId: parentSubId };

      await new Promise(resolve => setTimeout(resolve, 500));

      setCreatingProject(false);
      setSimpleProjectSuccessModal(true);
    } catch (error) {
      console.error('Error creating simple project:', error);
      setCreatingProject(false);
    }
  }, [creatingProject, canCreateSimpleProject, newProjectNumber, newProjectName, simpleProjectModal.parentSubId, simpleProjectModal.parentMainId, setHierarchy, auth?.currentUser?.email]);

  return {
    // State
    newProjectModal,
    setNewProjectModal,
    simpleProjectModal,
    setSimpleProjectModal,
    simpleProjectSuccessModal,
    setSimpleProjectSuccessModal,
    simpleProjectCreatedRef,
    creatingProjectInline,
    setCreatingProjectInline,
    newProjectName,
    setNewProjectName,
    newProjectNumber,
    setNewProjectNumber,
    newProjectPhase,
    setNewProjectPhase,
    newProjectCustomer,
    setNewProjectCustomer,
    newProjectClientContactName,
    setNewProjectClientContactName,
    newProjectClientContactPhone,
    setNewProjectClientContactPhone,
    newProjectClientContactEmail,
    setNewProjectClientContactEmail,
    newProjectAddressStreet,
    setNewProjectAddressStreet,
    newProjectAddressPostal,
    setNewProjectAddressPostal,
    newProjectAddressCity,
    setNewProjectAddressCity,
    newProjectPropertyDesignation,
    setNewProjectPropertyDesignation,
    newProjectParticipantsSearch,
    setNewProjectParticipantsSearch,
    newProjectAdvancedOpen,
    setNewProjectAdvancedOpen,
    focusedInput,
    setFocusedInput,
    hoveredSkyddsrondBtn,
    setHoveredSkyddsrondBtn,
    newProjectResponsible,
    setNewProjectResponsible,
    responsiblePickerVisible,
    setResponsiblePickerVisible,
    newProjectParticipants,
    setNewProjectParticipants,
    participantsPickerVisible,
    setParticipantsPickerVisible,
    companyAdmins,
    setCompanyAdmins,
    loadingCompanyAdmins,
    companyAdminsPermissionDenied,
    responsibleDropdownOpen,
    setResponsibleDropdownOpen,
    responsibleDropdownRef,
    nativeKeyboardHeight,
    nativeKeyboardHeightRef,
    companyMembers,
    setCompanyMembers,
    loadingCompanyMembers,
    setLoadingCompanyMembers,
    companyMembersPermissionDenied,
    setCompanyMembersPermissionDenied,
    newProjectSkyddsrondEnabled,
    setNewProjectSkyddsrondEnabled,
    newProjectSkyddsrondWeeks,
    setNewProjectSkyddsrondWeeks,
    newProjectSkyddsrondFirstDueDate,
    setNewProjectSkyddsrondFirstDueDate,
    skyddsrondWeeksPickerVisible,
    setSkyddsrondWeeksPickerVisible,
    creatingProject,
    setCreatingProject,
    newProjectKeyboardLockHeight,
    setNewProjectKeyboardLockHeight,
    // Derived
    newProjectSkyddsrondFirstDueValid,
    isProjectNumberUnique,
    canCreateProject,
    canCreateSimpleProject,
    // Actions
    resetProjectFields,
    loadCompanyAdmins,
    handleCreateSimpleProject,
  };
}
