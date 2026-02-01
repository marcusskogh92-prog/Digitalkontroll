import SharePointFolderFileArea from '@components/common/SharePointFiles/SharePointFolderFileArea';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

// NOTE: Folder names must match SharePoint structure definition.
const FORFRAGNINGSUNDERLAG_FOLDER = '02 - Förfrågningsunderlag';
const AF_FOLDER = '01 - Administrativa föreskrifter (AF)';

export default function AdministrativaForeskrifterView({ companyId, project }) {
  const basePath = safeText(
    project?.rootFolderPath ||
    project?.rootPath ||
    project?.sharePointPath ||
    project?.sharepointPath ||
    project?.sharePointBasePath ||
    project?.sharepointBasePath ||
    project?.basePath
  );

  const rootPath = `${basePath}/${FORFRAGNINGSUNDERLAG_FOLDER}/${AF_FOLDER}`.replace(/^\/+/, '').replace(/\/+/, '/');
  const scopeRootPath = `${basePath}/${FORFRAGNINGSUNDERLAG_FOLDER}`.replace(/^\/+/, '').replace(/\/+/, '/');

  return (
    <SharePointFolderFileArea
      companyId={companyId}
      project={project}
      title="Administrativa föreskrifter (AF)"
      subtitle="SharePoint (källan till sanning)"
      breadcrumbBaseSegments={[FORFRAGNINGSUNDERLAG_FOLDER, AF_FOLDER]}
      iconName="document-text-outline"
      rootPath={rootPath}
      scopeRootPath={scopeRootPath}
    />
  );
}
