import SharePointFolderFileArea from '@components/common/SharePointFiles/SharePointFolderFileArea';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

const FORFRAGNINGSUNDERLAG_FOLDER = '02 - Förfrågningsunderlag';
const FFU_SYSTEM_FOLDER = 'AI-sammanställning';

export default function FFUFileListView({
  companyId,
  project,
  ffuRelativePath = '',
  setFfuRelativePath = null,
  ffuSelectedItemId = null,
  setFfuSelectedItemId = null,
  bumpFfuMirrorRefreshNonce = null,
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

  const rootPath = `${basePath}/${FORFRAGNINGSUNDERLAG_FOLDER}`.replace(/^\/+/, '').replace(/\/+/, '/');

  return (
    <SharePointFolderFileArea
      companyId={companyId}
      project={project}
      title="Förfrågningsunderlag"
      subtitle="SharePoint (källan till sanning)"
      breadcrumbBaseSegments={[FORFRAGNINGSUNDERLAG_FOLDER]}
      showCreateFolderButton
      enableInlinePreview
      inlinePreviewMode="on-select-only"
      iconName="folder-outline"
      rootPath={rootPath}
      scopeRootPath={rootPath}
      relativePath={ffuRelativePath}
      onRelativePathChange={typeof setFfuRelativePath === 'function' ? setFfuRelativePath : null}
      selectedItemId={ffuSelectedItemId}
      onSelectedItemIdChange={typeof setFfuSelectedItemId === 'function' ? setFfuSelectedItemId : null}
      onDidMutate={typeof bumpFfuMirrorRefreshNonce === 'function' ? bumpFfuMirrorRefreshNonce : null}
      systemFolderName={FFU_SYSTEM_FOLDER}
      ensureSystemFolder
      pinSystemFolderLast
      lockSystemFolder
      systemFolderRootOnly
    />
  );
}
