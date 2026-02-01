import { getAccessToken } from '../azure/authService';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

export async function getSharePointDriveItemDownloadUrl(siteId, itemId) {
  const sid = safeText(siteId);
  const id = safeText(itemId);
  if (!sid) throw new Error('SharePoint siteId saknas.');
  if (!id) throw new Error('SharePoint itemId saknas.');

  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Saknar SharePoint-token. Logga in igen.');

  const endpoint = `${GRAPH_API_BASE}/sites/${encodeURIComponent(sid)}/drive/items/${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Kunde inte hämta filmetadata: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return {
    downloadUrl: safeText(data?.['@microsoft.graph.downloadUrl']),
    webUrl: safeText(data?.webUrl),
    name: safeText(data?.name),
  };
}

export async function getSharePointDriveItemArrayBuffer(siteId, itemId, { preferDownloadUrl = null } = {}) {
  // 1) Use token-authenticated Graph call to get a fresh downloadUrl (recommended).
  // 2) Fetch bytes as ArrayBuffer (pdf.js consumes data, not URL).
  const prefer = safeText(preferDownloadUrl);

  let meta = null;
  try {
    meta = await getSharePointDriveItemDownloadUrl(siteId, itemId);
  } catch (e) {
    // If Graph fails but caller already has a downloadUrl, we can still try.
    if (!prefer) throw e;
  }

  const downloadUrl = safeText(meta?.downloadUrl) || prefer;
  if (!downloadUrl) {
    throw new Error('Saknar nedladdningslänk för filen.');
  }

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Kunde inte ladda PDF-data: ${res.status} ${t}`);
  }

  return res.arrayBuffer();
}
