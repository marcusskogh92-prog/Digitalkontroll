import DigitalkontrollsUtforskare from '@components/common/DigitalkontrollsUtforskare';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** V2 structure: Anbud is section 10 */
const ANBUD_FOLDER = '10 - Anbud';

export default function AnbudRootFileListView({
  companyId,
  project,
  anbudRelativePath = '',
  setAnbudRelativePath = null,
  anbudSelectedItemId = null,
  setAnbudSelectedItemId = null,
  bumpAnbudMirrorRefreshNonce = null,
  showCreateFolderButton = true,
  hiddenCustomFolderNames = [],
}) {
  const basePath = safeText(
    project?.rootFolderPath ||
    project?.rootPath ||
    project?.sharePointPath ||
    project?.sharepointPath ||
    project?.sharePointBasePath ||
    project?.sharepointBasePath ||
    project?.basePath,
  );

  const rootPath = `${basePath}/${ANBUD_FOLDER}`.replace(/^\/+/, '').replace(/\/+/, '/');

  return (
    <DigitalkontrollsUtforskare
      companyId={companyId}
      project={project}
      title="Anbud"
      subtitle="SharePoint (källan till sanning)"
      breadcrumbBaseSegments={[ANBUD_FOLDER]}
      showCreateFolderButton={showCreateFolderButton}
      iconName="document-outline"
      hiddenFolderNames={Array.isArray(hiddenCustomFolderNames) ? hiddenCustomFolderNames : []}
      rootPath={rootPath}
      scopeRootPath={rootPath}
      relativePath={anbudRelativePath}
      onRelativePathChange={typeof setAnbudRelativePath === 'function' ? setAnbudRelativePath : null}
      selectedItemId={anbudSelectedItemId}
      onSelectedItemIdChange={typeof setAnbudSelectedItemId === 'function' ? setAnbudSelectedItemId : null}
      onDidMutate={typeof bumpAnbudMirrorRefreshNonce === 'function' ? bumpAnbudMirrorRefreshNonce : null}
      bottomDropZone
    />
  );
}
