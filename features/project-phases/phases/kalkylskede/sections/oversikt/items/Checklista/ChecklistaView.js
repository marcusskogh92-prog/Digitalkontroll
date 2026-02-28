/**
 * ChecklistaView – visar projektets checklista-mapp med samma utforskare som i systemet.
 * Klick på en fil (Excel, Word, PDF) öppnar förhandsgranskning i systemet (som i bilderna).
 * Excel-filen skapas automatiskt från företagets mall när projektet skapas (useCreateSharePointProjectModal).
 * Här kan användaren även lägga till fler filer eller checklistor om de vill.
 */

import DigitalkontrollsUtforskare from '@components/common/DigitalkontrollsUtforskare';

const CHECKLISTA_FOLDER = '01 - Översikt/01 - Checklista';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export default function ChecklistaView({ projectId, companyId, project, hidePageHeader }) {
  const basePath = safeText(
    project?.rootFolderPath ||
    project?.rootPath ||
    project?.sharePointPath ||
    project?.sharepointPath ||
    project?.sharePointBasePath ||
    project?.sharepointBasePath ||
    project?.basePath ||
    '',
  );

  const rootPath = basePath ? `${basePath}/${CHECKLISTA_FOLDER}`.replace(/^\/+/, '').replace(/\/+/g, '/') : '';

  if (!rootPath) {
    return null;
  }

  return (
    <DigitalkontrollsUtforskare
      companyId={companyId}
      project={project}
      title="01 - Checklista"
      subtitle="Checklista och övriga filer i denna mapp. Excel skapas från företagets mall vid projektskapande."
      breadcrumbBaseSegments={['01 - Översikt', '01 - Checklista']}
      showCreateFolderButton={true}
      iconName="document-text-outline"
      rootPath={rootPath}
      scopeRootPath={rootPath}
      ensureFolderOnLoad={false}
    />
  );
}
