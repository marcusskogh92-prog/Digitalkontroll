import DigitalkontrollsUtforskare from '@components/common/DigitalkontrollsUtforskare';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** V2 structure: Konstruktion och beräkningar is section 4 */
const KONSTRUKTION_FOLDER = '04 - Konstruktion och beräkningar';

export default function KonstruktionRootFileListView({
  companyId,
  project,
  konstruktionRelativePath = '',
  setKonstruktionRelativePath = null,
  konstruktionSelectedItemId = null,
  setKonstruktionSelectedItemId = null,
  bumpKonstruktionMirrorRefreshNonce = null,
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

  const rootPath = `${basePath}/${KONSTRUKTION_FOLDER}`.replace(/^\/+/, '').replace(/\/+/, '/');

  return (
    <DigitalkontrollsUtforskare
      companyId={companyId}
      project={project}
      title="Konstruktion och beräkningar"
      subtitle="SharePoint (källan till sanning)"
      breadcrumbBaseSegments={[KONSTRUKTION_FOLDER]}
      showCreateFolderButton={showCreateFolderButton}
      iconName="build-outline"
      hiddenFolderNames={Array.isArray(hiddenCustomFolderNames) ? hiddenCustomFolderNames : []}
      rootPath={rootPath}
      scopeRootPath={rootPath}
      relativePath={konstruktionRelativePath}
      onRelativePathChange={typeof setKonstruktionRelativePath === 'function' ? setKonstruktionRelativePath : null}
      selectedItemId={konstruktionSelectedItemId}
      onSelectedItemIdChange={typeof setKonstruktionSelectedItemId === 'function' ? setKonstruktionSelectedItemId : null}
      onDidMutate={typeof bumpKonstruktionMirrorRefreshNonce === 'function' ? bumpKonstruktionMirrorRefreshNonce : null}
      bottomDropZone
    />
  );
}
