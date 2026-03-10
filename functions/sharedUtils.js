function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSharePointSiteSlug(rawName) {
  const s = String(rawName || '').trim();
  if (!s) return '';
  return s
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/\s+/g, '')
    .substring(0, 50)
    .toLowerCase();
}

/** Normalize company id to a stable Firestore doc id (lowercase, hyphens). Same as client slugFromName. */
function normalizeCompanyIdToSlug(companyId) {
  const s = String(companyId || '').trim();
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 128) || s.replace(/\s+/g, '-').substring(0, 128);
}

function generateTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function callerIsAdmin(context) {
  const token = context?.auth?.token ? context.auth.token : {};
  return token.admin === true || token.role === 'admin' || token.globalAdmin === true;
}

module.exports = {
  sleep,
  normalizeSharePointSiteSlug,
  normalizeCompanyIdToSlug,
  generateTempPassword,
  callerIsAdmin,
};
