import React from 'react';

/**
 * Centraliserar all state och härledd logik för HomeScreen's uppgifts-/kontrollsektion
 * (HomeTasksSection) så att HomeScreen blir tunnare.
 */
export function useHomeTasksSection() {
  const [tasksOpen, setTasksOpen] = React.useState(true);
  const [controlsOpen, setControlsOpen] = React.useState(false);

  // State for project selection & control type modals (create control flow)
  const [selectProjectModal, setSelectProjectModal] = React.useState({ visible: false, type: null });
  const [showControlTypeModal, setShowControlTypeModal] = React.useState(false);
  const [controlTypeScrollMetrics, setControlTypeScrollMetrics] = React.useState({
    containerHeight: 0,
    contentHeight: 0,
    scrollY: 0,
  });

  const controlTypeCanScroll = controlTypeScrollMetrics.contentHeight > (controlTypeScrollMetrics.containerHeight + 1);

  const controlTypeThumbHeight = React.useMemo(() => {
    const { containerHeight, contentHeight } = controlTypeScrollMetrics;
    if (!containerHeight || !contentHeight || contentHeight <= containerHeight) return 0;
    const ratio = containerHeight / contentHeight;
    return Math.max(18, Math.round(containerHeight * ratio));
  }, [controlTypeScrollMetrics]);

  const controlTypeThumbTop = React.useMemo(() => {
    const { containerHeight, contentHeight, scrollY } = controlTypeScrollMetrics;
    if (!containerHeight || !contentHeight || contentHeight <= containerHeight) return 0;
    const maxScroll = contentHeight - containerHeight;
    if (maxScroll <= 0) return 0;
    const ratio = scrollY / maxScroll;
    const trackHeight = containerHeight - controlTypeThumbHeight;
    return Math.max(0, Math.min(trackHeight, Math.round(trackHeight * ratio)));
  }, [controlTypeScrollMetrics, controlTypeThumbHeight]);

  const [projectControlModal, setProjectControlModal] = React.useState({ visible: false, project: null });
  const [projectControlSelectedType, setProjectControlSelectedType] = React.useState('');
  const [projectControlTypePickerOpen, setProjectControlTypePickerOpen] = React.useState(false);
  const [projectControlTemplates, setProjectControlTemplates] = React.useState([]);
  const [projectControlSelectedTemplateId, setProjectControlSelectedTemplateId] = React.useState('');
  const [projectControlTemplatePickerOpen, setProjectControlTemplatePickerOpen] = React.useState(false);
  const [projectControlTemplateSearch, setProjectControlTemplateSearch] = React.useState('');

  return {
    tasksOpen,
    setTasksOpen,
    controlsOpen,
    setControlsOpen,
    selectProjectModal,
    setSelectProjectModal,
    showControlTypeModal,
    setShowControlTypeModal,
    controlTypeScrollMetrics,
    setControlTypeScrollMetrics,
    controlTypeCanScroll,
    controlTypeThumbHeight,
    controlTypeThumbTop,
    projectControlModal,
    setProjectControlModal,
    projectControlSelectedType,
    setProjectControlSelectedType,
    projectControlTypePickerOpen,
    setProjectControlTypePickerOpen,
    projectControlTemplates,
    setProjectControlTemplates,
    projectControlSelectedTemplateId,
    setProjectControlSelectedTemplateId,
    projectControlTemplatePickerOpen,
    setProjectControlTemplatePickerOpen,
    projectControlTemplateSearch,
    setProjectControlTemplateSearch,
  };
}
