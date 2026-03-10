import DigitalkontrollsUtforskare from '@components/common/DigitalkontrollsUtforskare';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** V2 structure: Bilder is section 07 */
const BILDER_FOLDER = '07 - Bilder';

export default function BilderFileListView({
  companyId,
  project,
  bilderRelativePath = '',
  setBilderRelativePath = null,
  bilderSelectedItemId = null,
  setBilderSelectedItemId = null,
  bumpBilderMirrorRefreshNonce = null,
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

  const rootPath = `${basePath}/${BILDER_FOLDER}`.replace(/^\/+/, '').replace(/\/+/, '/');

  return (
    <DigitalkontrollsUtforskare
      companyId={companyId}
      project={project}
      title="Bilder"
      subtitle="SharePoint (källan till sanning)"
      breadcrumbBaseSegments={[BILDER_FOLDER]}
      showCreateFolderButton={showCreateFolderButton}
      iconName="images-outline"
      hiddenFolderNames={Array.isArray(hiddenCustomFolderNames) ? hiddenCustomFolderNames : []}
      rootPath={rootPath}
      scopeRootPath={rootPath}
      relativePath={bilderRelativePath}
      onRelativePathChange={typeof setBilderRelativePath === 'function' ? setBilderRelativePath : null}
      selectedItemId={bilderSelectedItemId}
      onSelectedItemIdChange={typeof setBilderSelectedItemId === 'function' ? setBilderSelectedItemId : null}
      onDidMutate={typeof bumpBilderMirrorRefreshNonce === 'function' ? bumpBilderMirrorRefreshNonce : null}
      bottomDropZone
    />
  );
}
