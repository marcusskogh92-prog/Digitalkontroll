import DigitalkontrollsUtforskare from '@components/common/DigitalkontrollsUtforskare';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** V2 structure: Kalkyl is section 09 */
const KALKYL_FOLDER = '09 - Kalkyl';

export default function KalkylRootFileListView({
  companyId,
  project,
  kalkylRelativePath = '',
  setKalkylRelativePath = null,
  kalkylSelectedItemId = null,
  setKalkylSelectedItemId = null,
  bumpKalkylMirrorRefreshNonce = null,
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

  const rootPath = `${basePath}/${KALKYL_FOLDER}`.replace(/^\/+/, '').replace(/\/+/, '/');

  return (
    <DigitalkontrollsUtforskare
      companyId={companyId}
      project={project}
      title="Kalkyl"
      subtitle="SharePoint (källan till sanning)"
      breadcrumbBaseSegments={[KALKYL_FOLDER]}
      showCreateFolderButton={showCreateFolderButton}
      iconName="calculator-outline"
      hiddenFolderNames={Array.isArray(hiddenCustomFolderNames) ? hiddenCustomFolderNames : []}
      rootPath={rootPath}
      scopeRootPath={rootPath}
      relativePath={kalkylRelativePath}
      onRelativePathChange={typeof setKalkylRelativePath === 'function' ? setKalkylRelativePath : null}
      selectedItemId={kalkylSelectedItemId}
      onSelectedItemIdChange={typeof setKalkylSelectedItemId === 'function' ? setKalkylSelectedItemId : null}
      onDidMutate={typeof bumpKalkylMirrorRefreshNonce === 'function' ? bumpKalkylMirrorRefreshNonce : null}
      bottomDropZone
    />
  );
}
