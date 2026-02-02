import { getAccessToken } from '../azure/authService';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function isPdfDebugEnabled() {
  try {
    return !!(typeof window !== 'undefined' && window.__DK_PDF_DEBUG__);
  } catch (_e) {
    return false;
  }
}

function bytesToAscii(bytes) {
  try {
    return Array.from(bytes)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');
  } catch (_e) {
    return '';
  }
}

function bytesToHex(bytes) {
  try {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
  } catch (_e) {
    return '';
  }
}

function getPdfProbe(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  const head5 = u8.slice(0, Math.min(5, u8.length));
  const ascii5 = bytesToAscii(head5);
  const hex5 = bytesToHex(head5);
  const isPdf =
    head5.length >= 5 &&
    head5[0] === 0x25 &&
    head5[1] === 0x50 &&
    head5[2] === 0x44 &&
    head5[3] === 0x46 &&
    head5[4] === 0x2d;
  return {
    length: u8.length,
    ascii5,
    hex5,
    isPdf,
  };
}

function logPdfHeader(arrayBuffer, label, contentType) {
  if (!isPdfDebugEnabled()) return;
  try {
    const probe = getPdfProbe(arrayBuffer);
    console.debug(
      '[PDFJS][bytes]',
      safeText(label),
      `len=${probe.length}`,
      `contentType=${safeText(contentType)}`,
      `first5="${probe.ascii5}"`,
      `hex=${probe.hex5}`,
      `isPdf=${probe.isPdf}`,
    );
  } catch (_e) {
    // ignore
  }
}

function assertLikelyPdf(arrayBuffer, { label, contentType } = {}) {
  const probe = getPdfProbe(arrayBuffer);
  const ct = safeText(contentType).toLowerCase();
  logPdfHeader(arrayBuffer, label, contentType);

  // Basic sanity checks: avoid passing HTML/redirect content into pdf.js.
  const looksLikeHtml = ct.includes('text/html') || ct.includes('application/xhtml');
  const tooSmall = probe.length > 0 && probe.length < 2048;

  if (!probe.isPdf || looksLikeHtml || tooSmall) {
    throw new Error('Förhandsvisning stöds inte – öppna i ny flik');
  }
}

async function getSharePointDriveItemContentArrayBuffer(siteId, itemId) {
  const sid = safeText(siteId);
  const id = safeText(itemId);
  if (!sid) throw new Error('SharePoint siteId saknas.');
  if (!id) throw new Error('SharePoint itemId saknas.');

  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Saknar SharePoint-token. Logga in igen.');

  // Prefer Graph /content (returns bytes or redirects to a pre-auth URL).
  const endpoint = `${GRAPH_API_BASE}/sites/${encodeURIComponent(sid)}/drive/items/${encodeURIComponent(id)}/content`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/pdf',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Kunde inte ladda filinnehåll: ${res.status} ${t}`);
  }

  const contentType = safeText(res.headers?.get?.('content-type'));
  const buf = await res.arrayBuffer();
  assertLikelyPdf(buf, { label: 'graph/content', contentType });
  return buf;
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
  // 1) Prefer token-authenticated Graph /content to get bytes as ArrayBuffer.
  // 2) Fallback: token-authenticated metadata -> downloadUrl (fetch WITHOUT auth headers).
  //    (Never fetch downloadUrl with Authorization headers.)
  const prefer = safeText(preferDownloadUrl);

  try {
    const buf = await getSharePointDriveItemContentArrayBuffer(siteId, itemId);
    return buf;
  } catch (e) {
    // Fallback below.
  }

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

  const res = await fetch(downloadUrl, { redirect: 'follow' });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Kunde inte ladda PDF-data: ${res.status} ${t}`);
  }

  const contentType = safeText(res.headers?.get?.('content-type'));
  const buf = await res.arrayBuffer();
  assertLikelyPdf(buf, { label: 'downloadUrl', contentType });
  return buf;
}
