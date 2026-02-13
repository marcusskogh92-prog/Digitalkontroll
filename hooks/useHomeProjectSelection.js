import React from 'react';
import { Alert, Platform } from 'react-native';

/**
 * Centraliserar projektval + inline-editor-livscykel för HomeScreen.
 *
 * Äger:
 * - selectedProject + selectedProjectPath
 * - projectSelectedAction
 * - inlineControlEditor + projectInlineViewLabel
 * - isInlineLocked + pending refs för inline-exit-dialogen
 */
export function useHomeProjectSelection({
  showAlert,
  resetProjectFields,
  creatingProjectInline,
  setCreatingProjectInline,
  newProjectName,
  setNewProjectName,
  newProjectNumber,
  setNewProjectNumber,
  setProjectControlsRefreshNonce,
}) {
  const [selectedProject, setSelectedProject] = React.useState(null);
  const [selectedProjectPath, setSelectedProjectPath] = React.useState(null);
  const selectedProjectRef = React.useRef(null);
  const [selectedProjectFolders, setSelectedProjectFolders] = React.useState([]);
  const [selectedProjectFoldersLoading, setSelectedProjectFoldersLoading] = React.useState(false);

  const [projectSelectedAction, setProjectSelectedAction] = React.useState(null);
  const [inlineControlEditor, setInlineControlEditor] = React.useState(null);
  const [projectInlineViewLabel, setProjectInlineViewLabel] = React.useState(null);

  const [isInlineLocked, setIsInlineLocked] = React.useState(false);
  const pendingProjectSwitchRef = React.useRef(null);
  const pendingBreadcrumbNavRef = React.useRef(null);

  const [leaveProjectModalVisible, setLeaveProjectModalVisible] = React.useState(false);
  const [leaveProjectCurrentLabel, setLeaveProjectCurrentLabel] = React.useState('');
  const pendingLeaveProjectRef = React.useRef(null);

  React.useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

  function formatProjectLabel(project) {
    if (!project) return '';
    const num = String(project?.projectNumber || project?.number || project?.id || '').trim();
    const name = String(project?.projectName || project?.name || '').trim();
    if (num && name) return `${num} – ${name}`;
    return name || num || 'Projekt';
  }

  const handleInlineLockChange = React.useCallback((locked) => {
    setIsInlineLocked(!!locked);
  }, []);

  const applyPendingLeaveProject = React.useCallback(() => {
    const pending = pendingLeaveProjectRef.current;
    pendingLeaveProjectRef.current = null;
    setLeaveProjectModalVisible(false);
    if (!pending) return;
    if (!pending.project) {
      if (Object.prototype.hasOwnProperty.call(pending.opts || {}, 'selectedAction')) {
        setProjectSelectedAction(pending.opts.selectedAction);
      }
      setSelectedProjectPath(null);
      setSelectedProject(null);
      return;
    }
    const nextProject = pending.project;
    const opts = pending.opts || {};
    const selectedActionProvided = Object.prototype.hasOwnProperty.call(opts, 'selectedAction');
    const clearActionAfter = !!opts.clearActionAfter;
    if (selectedActionProvided) setProjectSelectedAction(opts.selectedAction);
    try {
      const p = opts.path;
      setSelectedProjectPath(p ? { ...p, projectId: String(nextProject?.id || '') } : null);
    } catch (_e) {}
    setSelectedProject(nextProject);
    if (clearActionAfter) setTimeout(() => setProjectSelectedAction(null), 0);
  }, []);

  const cancelLeaveProject = React.useCallback(() => {
    pendingLeaveProjectRef.current = null;
    setLeaveProjectModalVisible(false);
  }, []);

  const requestProjectSwitch = React.useCallback(
    (project, opts = {}) => {
      const current = selectedProjectRef.current;
      const currentId = current ? String(current?.id || '').trim() : '';
      const nextId = project ? String(project?.id || '').trim() : '';
      const isClosing = !project;
      const isSwitchingToOther = currentId && (isClosing || nextId !== currentId);

      if (current && isSwitchingToOther && Platform.OS === 'web' && !isInlineLocked) {
        pendingLeaveProjectRef.current = { project, opts };
        setLeaveProjectCurrentLabel(formatProjectLabel(current));
        setLeaveProjectModalVisible(true);
        return;
      }

      if (!project) {
        if (Object.prototype.hasOwnProperty.call(opts, 'selectedAction')) {
          setProjectSelectedAction(opts.selectedAction);
        }
        try {
          setSelectedProjectPath(null);
        } catch (_e) {}
        setSelectedProject(null);
        return;
      }

      const nextProject = { ...project };
      const selectedActionProvided = Object.prototype.hasOwnProperty.call(
        opts,
        'selectedAction',
      );
      const clearActionAfter = !!opts.clearActionAfter;

      if (Platform.OS === 'web' && isInlineLocked) {
        pendingProjectSwitchRef.current = {
          project: nextProject,
          selectedAction: selectedActionProvided ? opts.selectedAction : null,
          clearActionAfter,
        };
        try {
          window.dispatchEvent(new CustomEvent('dkInlineAttemptExit'));
        } catch (_e) {
          if (selectedActionProvided) setProjectSelectedAction(opts.selectedAction);
          try {
            const p = opts?.path;
            setSelectedProjectPath(p ? { ...p, projectId: String(nextProject?.id || '') } : null);
          } catch (_e2) {}
          setSelectedProject(nextProject);
          if (clearActionAfter) setTimeout(() => setProjectSelectedAction(null), 0);
        }
        return;
      }

      if (selectedActionProvided) setProjectSelectedAction(opts.selectedAction);
      try {
        const p = opts?.path;
        setSelectedProjectPath(p ? { ...p, projectId: String(nextProject?.id || '') } : null);
      } catch (_e) {}
      setSelectedProject(nextProject);
      if (clearActionAfter) setTimeout(() => setProjectSelectedAction(null), 0);
    },
    [isInlineLocked],
  );

  const closeSelectedProject = React.useCallback(() => {
    if (creatingProjectInline && selectedProject?.isTemporary) {
      if (!newProjectNumber.trim() && !newProjectName.trim()) {
        setCreatingProjectInline(null);
        setNewProjectName('');
        setNewProjectNumber('');
        resetProjectFields();
        setProjectSelectedAction(null);
        try {
          setSelectedProjectPath(null);
        } catch (_e) {}
        setSelectedProject(null);
        return;
      }
      Alert.alert('Avbryt skapande?', 'Om du stänger nu kommer projektet inte att sparas.', [
        { text: 'Fortsätt redigera', style: 'cancel' },
        {
          text: 'Stäng',
          style: 'destructive',
          onPress: () => {
            setCreatingProjectInline(null);
            setNewProjectName('');
            setNewProjectNumber('');
            resetProjectFields();
            setProjectSelectedAction(null);
            try {
              setSelectedProjectPath(null);
            } catch (_e) {}
            setSelectedProject(null);
          },
        },
      ]);
      return;
    }

    if (Platform.OS === 'web' && selectedProject) {
      requestProjectSwitch(null);
      return;
    }

    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      window.history &&
      typeof window.history.replaceState === 'function'
    ) {
      try {
        const st = window.history.state || {};
        window.history.replaceState({ ...st, dkView: 'home', projectId: null }, '', '/');
      } catch (_e) {}
    }
    setProjectSelectedAction(null);
    try {
      setSelectedProjectPath(null);
    } catch (_e) {}
    setSelectedProject(null);
  }, [
    creatingProjectInline,
    newProjectName,
    newProjectNumber,
    resetProjectFields,
    requestProjectSwitch,
    selectedProject,
    setCreatingProjectInline,
    setNewProjectName,
    setNewProjectNumber,
  ]);

  const openInlineControlEditor = React.useCallback((project, controlType, templateId = null) => {
    if (!project || !controlType) return;
    try {
      setSelectedProjectPath(null);
    } catch (_e) {}
    setSelectedProject(project);
    setInlineControlEditor({ project, controlType, templateId });
    setProjectSelectedAction(null);
  }, []);

  const closeInlineControlEditor = React.useCallback(() => {
    setInlineControlEditor(null);
  }, []);

  const handleInlineControlFinished = React.useCallback(() => {
    try {
      showAlert('Sparad', 'Kontrollen är sparad.');
    } catch (_e) {}
    setInlineControlEditor(null);
    setProjectControlsRefreshNonce((n) => n + 1);
  }, [setProjectControlsRefreshNonce, showAlert]);

  const handleInlineViewChange = React.useCallback((payload) => {
    try {
      if (!payload) {
        setProjectInlineViewLabel(null);
        return;
      }
      if (typeof payload === 'string') {
        const v = String(payload || '').trim();
        setProjectInlineViewLabel(v || null);
        return;
      }
      const label = String(payload?.label || '').trim();
      setProjectInlineViewLabel(label || null);
    } catch (_e) {
      try {
        setProjectInlineViewLabel(null);
      } catch (__e) {}
    }
  }, []);

  React.useEffect(() => {
    if (!selectedProject) {
      setProjectInlineViewLabel(null);
      return;
    }
    if (inlineControlEditor) {
      setProjectInlineViewLabel(null);
    }
  }, [selectedProject, inlineControlEditor]);

  return {
    selectedProject,
    setSelectedProject,
    selectedProjectPath,
    setSelectedProjectPath,
    selectedProjectRef,
    selectedProjectFolders,
    setSelectedProjectFolders,
    selectedProjectFoldersLoading,
    setSelectedProjectFoldersLoading,
    projectSelectedAction,
    setProjectSelectedAction,
    inlineControlEditor,
    setInlineControlEditor,
    projectInlineViewLabel,
    setProjectInlineViewLabel,
    isInlineLocked,
    handleInlineLockChange,
    pendingProjectSwitchRef,
    pendingBreadcrumbNavRef,
    requestProjectSwitch,
    closeSelectedProject,
    openInlineControlEditor,
    closeInlineControlEditor,
    handleInlineControlFinished,
    handleInlineViewChange,
    leaveProjectModalVisible,
    leaveProjectCurrentLabel,
    confirmLeaveProject: applyPendingLeaveProject,
    cancelLeaveProject,
  };
}
