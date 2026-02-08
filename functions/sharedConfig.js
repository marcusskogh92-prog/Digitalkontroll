const functions = require('firebase-functions');

function readFunctionsConfigValue(path, fallback = null) {
  try {
    const cfg = functions.config && typeof functions.config === 'function' ? functions.config() : {};
    const parts = String(path || '').split('.').filter(Boolean);
    let cur = cfg;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object') return fallback;
      cur = cur[p];
    }
    if (cur === undefined || cur === null || cur === '') return fallback;
    return cur;
  } catch (_e) {
    return fallback;
  }
}

function getSharePointHostname() {
  const url =
    process.env.SHAREPOINT_SITE_URL ||
    process.env.EXPO_PUBLIC_SHAREPOINT_SITE_URL ||
    readFunctionsConfigValue('sharepoint.site_url', null) ||
    readFunctionsConfigValue('sharepoint.siteUrl', null) ||
    readFunctionsConfigValue('azure.sharepoint_site_url', null) ||
    readFunctionsConfigValue('azure.sharepointSiteUrl', null);
  if (url) {
    try {
      return new URL(String(url)).hostname;
    } catch (_e) {
      // fall through
    }
  }

  const host =
    process.env.SHAREPOINT_HOSTNAME ||
    readFunctionsConfigValue('sharepoint.hostname', null) ||
    readFunctionsConfigValue('azure.sharepoint_hostname', null);
  return host ? String(host).trim() : null;
}

function getSharePointProvisioningAccessToken() {
  const token =
    process.env.SHAREPOINT_PROVISION_ACCESS_TOKEN ||
    process.env.SHAREPOINT_GRAPH_ACCESS_TOKEN ||
    readFunctionsConfigValue('sharepoint.provision_access_token', null) ||
    readFunctionsConfigValue('sharepoint.provisionAccessToken', null) ||
    readFunctionsConfigValue('sharepoint.access_token', null) ||
    readFunctionsConfigValue('sharepoint.accessToken', null);
  return token ? String(token).trim() : null;
}

function getSharePointGraphTenantId() {
  const id =
    process.env.SHAREPOINT_TENANT_ID ||
    process.env.AZURE_TENANT_ID ||
    readFunctionsConfigValue('sharepoint.tenant_id', null) ||
    readFunctionsConfigValue('sharepoint.tenantId', null) ||
    readFunctionsConfigValue('azure.tenant_id', null) ||
    readFunctionsConfigValue('azure.tenantId', null);
  return id ? String(id).trim() : null;
}

function getSharePointGraphClientId() {
  const id =
    process.env.SHAREPOINT_CLIENT_ID ||
    process.env.AZURE_CLIENT_ID ||
    readFunctionsConfigValue('sharepoint.client_id', null) ||
    readFunctionsConfigValue('sharepoint.clientId', null) ||
    readFunctionsConfigValue('azure.client_id', null) ||
    readFunctionsConfigValue('azure.clientId', null);
  return id ? String(id).trim() : null;
}

function getSharePointGraphClientSecret() {
  const secret =
    process.env.SHAREPOINT_CLIENT_SECRET ||
    process.env.AZURE_CLIENT_SECRET ||
    readFunctionsConfigValue('sharepoint.client_secret', null) ||
    readFunctionsConfigValue('sharepoint.clientSecret', null) ||
    readFunctionsConfigValue('azure.client_secret', null) ||
    readFunctionsConfigValue('azure.clientSecret', null);
  return secret ? String(secret).trim() : null;
}

function getSharePointGraphConfigPresence() {
  const tenantId = getSharePointGraphTenantId();
  const clientId = getSharePointGraphClientId();
  const clientSecret = getSharePointGraphClientSecret();
  const staticToken = getSharePointProvisioningAccessToken();
  return {
    hasTenantId: !!(tenantId && tenantId.trim()),
    hasClientId: !!(clientId && clientId.trim()),
    hasClientSecret: !!(clientSecret && clientSecret.trim()),
    hasStaticToken: !!(staticToken && staticToken.trim()),
  };
}

let graphTokenCache = {
  accessToken: null,
  expiresAtMs: 0,
};

async function mintSharePointGraphAccessTokenClientCredentials() {
  const tenantId = getSharePointGraphTenantId();
  const clientId = getSharePointGraphClientId();
  const clientSecret = getSharePointGraphClientSecret();

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Graph client credentials (tenantId/clientId/clientSecret)');
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);
  params.set('scope', 'https://graph.microsoft.com/.default');
  params.set('grant_type', 'client_credentials');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const raw = await res.text().catch(() => '');
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_e) {
    data = {};
  }

  if (!res.ok) {
    const code = data?.error ? String(data.error) : null;
    const desc = data?.error_description ? String(data.error_description) : null;
    const msg = [
      `Graph token mint failed (client_credentials) status=${res.status}`,
      code ? `error=${code}` : null,
      desc ? `desc=${desc.slice(0, 180)}` : null,
    ].filter(Boolean).join(' | ');
    throw new Error(msg);
  }

  const accessToken = data?.access_token ? String(data.access_token) : '';
  const expiresIn = data?.expires_in != null ? Number(data.expires_in) : null;
  if (!accessToken) {
    throw new Error('Graph token mint succeeded but access_token missing');
  }

  const now = Date.now();
  const ttlMs = Number.isFinite(expiresIn) && expiresIn > 0 ? (expiresIn * 1000) : (50 * 60 * 1000);
  const skewMs = 60 * 1000; // refresh 60s early
  graphTokenCache = {
    accessToken,
    expiresAtMs: now + Math.max(30 * 1000, ttlMs - skewMs),
  };

  return accessToken;
}

async function getSharePointGraphAccessToken() {
  const staticToken = getSharePointProvisioningAccessToken();
  if (staticToken) return staticToken;

  const now = Date.now();
  if (graphTokenCache.accessToken && graphTokenCache.expiresAtMs && now < graphTokenCache.expiresAtMs) {
    return graphTokenCache.accessToken;
  }

  return await mintSharePointGraphAccessTokenClientCredentials();
}

function getSharePointProvisioningOwnerEmail(actorEmail) {
  const configured =
    process.env.SHAREPOINT_OWNER_EMAIL ||
    readFunctionsConfigValue('sharepoint.owner_email', null) ||
    readFunctionsConfigValue('sharepoint.ownerEmail', null);
  const fallback = 'marcus@msbyggsystem.se';
  const actor = actorEmail ? String(actorEmail).trim() : '';
  return (configured ? String(configured).trim() : null) || (actor || null) || fallback;
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || readFunctionsConfigValue('smtp.host', null);
  const portRaw = process.env.SMTP_PORT || readFunctionsConfigValue('smtp.port', null);
  const user = process.env.SMTP_USER || readFunctionsConfigValue('smtp.user', null);
  const pass = process.env.SMTP_PASS || readFunctionsConfigValue('smtp.pass', null);
  const secureRaw = process.env.SMTP_SECURE || readFunctionsConfigValue('smtp.secure', null);
  const from = process.env.SMTP_FROM || readFunctionsConfigValue('smtp.from', null) || user;

  const port = portRaw !== null && portRaw !== undefined && String(portRaw).trim() !== '' ? parseInt(String(portRaw).trim(), 10) : null;
  const secure = String(secureRaw).toLowerCase() === 'true' || secureRaw === true;

  return {
    host: host ? String(host).trim() : null,
    port: Number.isFinite(port) ? port : null,
    user: user ? String(user).trim() : null,
    pass: pass ? String(pass).trim() : null,
    secure,
    from: from ? String(from).trim() : null,
  };
}

module.exports = {
  readFunctionsConfigValue,
  getSharePointHostname,
  getSharePointProvisioningAccessToken,
  getSharePointGraphTenantId,
  getSharePointGraphClientId,
  getSharePointGraphClientSecret,
  getSharePointGraphConfigPresence,
  getSharePointGraphAccessToken,
  getSharePointProvisioningOwnerEmail,
  getSmtpConfig,
};
