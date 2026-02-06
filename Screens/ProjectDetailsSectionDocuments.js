import React from 'react';
import ProjectDocumentsView from '../components/common/ProjectDocumentsView';

export default function ProjectDetailsSectionDocuments({
  activeSection,
  project,
  companyId,
}) {
  if (activeSection !== 'documents') return null;
  return (
    <ProjectDocumentsView
      project={project}
      companyId={companyId}
    />
  );
}
