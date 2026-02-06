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
  getSharePointProvisioningOwnerEmail,
  getSmtpConfig,
};
