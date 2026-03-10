import DigitalkontrollsUtforskare from '@components/common/DigitalkontrollsUtforskare';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** V2 structure: Myndigheter is section 05. V1 uses 06 - Myndigheter (migration handled in fileService). */
const MYNDIGHETER_FOLDER = '05 - Myndigheter';

export default function MyndigheterFileListView({
  companyId,
  project,
  myndigheterRelativePath = '',
  setMyndigheterRelativePath = null,
  myndigheterSelectedItemId = null,
  setMyndigheterSelectedItemId = null,
  bumpMyndigheterMirrorRefreshNonce = null,
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

  const rootPath = `${basePath}/${MYNDIGHETER_FOLDER}`.replace(/^\/+/, '').replace(/\/+/, '/');

  return (
    <DigitalkontrollsUtforskare
      companyId={companyId}
      project={project}
      title="Myndigheter"
      subtitle="SharePoint (källan till sanning)"
      breadcrumbBaseSegments={[MYNDIGHETER_FOLDER]}
      showCreateFolderButton={showCreateFolderButton}
      iconName="business-outline"
      hiddenFolderNames={Array.isArray(hiddenCustomFolderNames) ? hiddenCustomFolderNames : []}
      rootPath={rootPath}
      scopeRootPath={rootPath}
      relativePath={myndigheterRelativePath}
      onRelativePathChange={typeof setMyndigheterRelativePath === 'function' ? setMyndigheterRelativePath : null}
      selectedItemId={myndigheterSelectedItemId}
      onSelectedItemIdChange={typeof setMyndigheterSelectedItemId === 'function' ? setMyndigheterSelectedItemId : null}
      onDidMutate={typeof bumpMyndigheterMirrorRefreshNonce === 'function' ? bumpMyndigheterMirrorRefreshNonce : null}
      bottomDropZone
    />
  );
}
