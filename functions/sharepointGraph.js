function encodeGraphPath(path) {
  const clean = String(path || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .trim();
  if (!clean) return '';
  return clean
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function graphGetSiteByUrl({ hostname, siteSlug, accessToken }) {
  const slug = String(siteSlug || '').trim();
  const host = String(hostname || '').trim();
  if (!slug || !host) throw new Error('hostname and siteSlug are required');
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${host}:/sites/${slug}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    const txt = await res.text();
    throw new Error(`Graph getSiteByUrl failed: ${res.status} - ${txt}`);
  }
  const data = await res.json();
  return { siteId: data.id, webUrl: data.webUrl };
}

async function graphCreateTeamSite({ hostname, siteSlug, displayName, description, accessToken, ownerEmail }) {
  const payload = {
    displayName: String(displayName || '').trim(),
    name: String(siteSlug || '').trim(),
    description: String(description || '').trim(),
    siteCollection: { hostname: String(hostname || '').trim() },
    template: 'teamSite',
    ownerIdentityToResolve: { email: String(ownerEmail || '').trim() },
  };

  const res = await fetch('https://graph.microsoft.com/beta/sites', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 409 || res.status === 400) {
      return null;
    }
    throw new Error(`Graph createSite failed: ${res.status} - ${txt}`);
  }

  const data = await res.json();
  return { siteId: data.id, webUrl: data.webUrl };
}

async function graphDeleteSite({ siteId, accessToken }) {
  const sid = String(siteId || '').trim();
  if (!sid) return;
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${sid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`Graph delete site failed: ${res.status} - ${txt}`);
  }
}

async function graphGetChildren({ siteId, path, accessToken }) {
  const sid = String(siteId || '').trim();
  if (!sid) throw new Error('siteId is required');
  const clean = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  const endpoint = clean
    ? `https://graph.microsoft.com/v1.0/sites/${sid}/drive/root:/${encodeGraphPath(clean)}:/children`
    : `https://graph.microsoft.com/v1.0/sites/${sid}/drive/root/children`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Graph list children failed: ${res.status} - ${txt}`);
  }
  const data = await res.json();
  return data?.value || [];
}

async function graphDeleteItem({ siteId, itemId, accessToken }) {
  const sid = String(siteId || '').trim();
  const iid = String(itemId || '').trim();
  if (!sid || !iid) throw new Error('siteId and itemId are required');
  const endpoint = `https://graph.microsoft.com/v1.0/sites/${sid}/drive/items/${iid}`;
  const res = await fetch(endpoint, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`Graph delete item failed: ${res.status} - ${txt}`);
  }
}

async function deleteDriveTreeByPathAdmin({ siteId, path, accessToken }) {
  const children = await graphGetChildren({ siteId, path, accessToken });
  for (const item of children || []) {
    const name = String(item?.name || '').trim();
    if (!name) continue;
    const isFolder = !!item?.folder;
    const childPath = path ? `${path}/${name}` : name;
    if (isFolder) {
      await deleteDriveTreeByPathAdmin({ siteId, path: childPath, accessToken });
    }
    if (item?.id) {
      await graphDeleteItem({ siteId, itemId: item.id, accessToken });
    }
  }
}

async function ensureFolderPathAdmin({ siteId, path, accessToken }) {
  const parts = String(path || '').split('/').map((p) => String(p || '').trim()).filter(Boolean);
  if (parts.length === 0) return;
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const encoded = encodeGraphPath(current);
    const checkEndpoint = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encoded}:`;
    const checkRes = await fetch(checkEndpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (checkRes.ok) {
      continue;
    }
    const parentPath = current.split('/').slice(0, -1).join('/');
    const createEndpoint = parentPath
      ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeGraphPath(parentPath)}:/children`
      : `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`;
    const createRes = await fetch(createEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: part,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'replace',
      }),
    });
    if (!createRes.ok) {
      const txt = await createRes.text();
      throw new Error(`Graph create folder failed: ${createRes.status} - ${txt}`);
    }
  }
}

async function ensureDkBasStructureAdmin({ siteId, accessToken }) {
  const folders = [
    'Arkiv',
    'Arkiv/Projekt',
    'Arkiv/Mappar',
    'Arkiv/Filer',
    'Metadata',
    'System',
  ];
  for (const folder of folders) {
    await ensureFolderPathAdmin({ siteId, path: folder, accessToken });
  }
}

module.exports = {
  encodeGraphPath,
  graphGetSiteByUrl,
  graphCreateTeamSite,
  graphDeleteSite,
  graphGetChildren,
  graphDeleteItem,
  deleteDriveTreeByPathAdmin,
  ensureFolderPathAdmin,
  ensureDkBasStructureAdmin,
};
