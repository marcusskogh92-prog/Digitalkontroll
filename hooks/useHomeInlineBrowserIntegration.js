import React from 'react';
import { Platform } from 'react-native';

// Web-only integration för inline-editor (lyssnar på dkInlineExitDecision från BaseControlForm)
export const useHomeInlineBrowserIntegration = ({
  pendingProjectSwitchRef,
  pendingBreadcrumbNavRef,
  setProjectSelectedAction,
  setSelectedProject,
  applyBreadcrumbTarget,
}) => {
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const onDecision = (event) => {
      const decision = event?.detail?.decision;
      const pendingSwitch = pendingProjectSwitchRef.current;
      pendingProjectSwitchRef.current = null;

      const pendingBreadcrumb = pendingBreadcrumbNavRef.current;
      pendingBreadcrumbNavRef.current = null;

      if (decision !== 'draft' && decision !== 'abort') return;

      if (pendingSwitch && pendingSwitch.project) {
        try {
          setProjectSelectedAction(pendingSwitch.selectedAction ?? null);
        } catch (_e) {}
        setSelectedProject({ ...pendingSwitch.project });
        if (pendingSwitch.clearActionAfter) setTimeout(() => setProjectSelectedAction(null), 0);
      }

      if (pendingBreadcrumb) {
        applyBreadcrumbTarget(pendingBreadcrumb);
      }
    };

    window.addEventListener('dkInlineExitDecision', onDecision);
    return () => {
      try {
        window.removeEventListener('dkInlineExitDecision', onDecision);
      } catch (_e) {}
    };
  }, [
    pendingProjectSwitchRef,
    pendingBreadcrumbNavRef,
    setProjectSelectedAction,
    setSelectedProject,
    applyBreadcrumbTarget,
  ]);
};
