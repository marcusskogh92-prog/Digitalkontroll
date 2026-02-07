const functions = require('firebase-functions');

const { admin, db, FieldValue } = require('./sharedFirebase');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const { syncSharePointSiteVisibility } = require('./sharepointVisibility');
const { provisionCompanyImpl } = require('./companyProvisioning');
const { createUser, deleteUser, updateUser } = require('./userAdmin');
const { requestSubscriptionUpgrade } = require('./billing');
const { setSuperadmin } = require('./superadmin');
const { adminFetchCompanyMembers, setCompanyStatus, setCompanyUserLimit, setCompanyName } = require('./companyAdmin');
const { purgeCompany } = require('./companyPurge');
const { devResetAdmin } = require('./devReset');

exports.syncSharePointSiteVisibility = functions.https.onCall(syncSharePointSiteVisibility);

exports.provisionCompany = functions.https.onCall(provisionCompanyImpl);
exports.provisionCompanyImpl = provisionCompanyImpl;

exports.createUser = functions.https.onCall(createUser);
exports.requestSubscriptionUpgrade = functions.https.onCall(requestSubscriptionUpgrade);
exports.setSuperadmin = functions.https.onCall(setSuperadmin);
exports.deleteUser = functions.https.onCall(deleteUser);
exports.updateUser = functions.https.onCall(updateUser);

exports.adminFetchCompanyMembers = functions.https.onCall(adminFetchCompanyMembers);
exports.setCompanyStatus = functions.https.onCall(setCompanyStatus);
exports.setCompanyUserLimit = functions.https.onCall(setCompanyUserLimit);
exports.setCompanyName = functions.https.onCall(setCompanyName);
exports.purgeCompany = functions.https.onCall(purgeCompany);

exports.devResetAdmin = functions.https.onCall(devResetAdmin);

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

function getOpenAIKey() {
  const key =
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY ||
    readFunctionsConfigValue('openai.key', null) ||
    readFunctionsConfigValue('openai.api_key', null) ||
    readFunctionsConfigValue('openai.apiKey', null);
  return key ? String(key).trim() : null;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || ''), 'utf8').digest('hex');
}

function buildFFUPrompt({ companyId, projectId, files }) {
  const safeFiles = (Array.isArray(files) ? files : []).map((f) => ({
    id: f && f.id != null ? String(f.id) : '',
    name: f && f.name != null ? String(f.name) : '',
    type: f && f.type != null ? String(f.type) : '',
    extractedText: f && f.extractedText != null ? String(f.extractedText) : '',
  }));

  const system = [
    'Du är en noggrann assistent som analyserar svenska förfrågningsunderlag (FFU).',
    'Du får ENDAST använda texten som tillhandahålls i detta anrop. Om något inte framgår av texten ska du skriva tom sträng eller utelämna det genom att inte hitta något (t.ex. tomma listor).',
    'Du får INTE göra antaganden om AF/AB/TB, entreprenadform, juridik eller praxis om det inte uttryckligen står i texten.',
    'Om källhänvisning inte går att avgöra exakt: ange dokumentnamn och en kort beskrivning av var i texten (t.ex. "Bilaga 2 – Kravspec, avsnitt 3") eller lämna "source" som tom sträng.',
    'Returnera ENDAST giltig JSON som exakt matchar det efterfrågade formatet. Ingen Markdown. Inga extra nycklar.',
  ].join('\n');

  const user = [
    'Analysera följande FFU som ett sammanhängande underlag.',
    '',
    `companyId: ${String(companyId || '').trim()}`,
    `projectId: ${String(projectId || '').trim()}`,
    '',
    'Dokument (med extraherad text):',
    JSON.stringify(
      safeFiles.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        extractedText: f.extractedText,
      })),
      null,
      2
    ),
    '',
    'Krav på output:',
    '- summary.description: kort sammanfattning av vad upphandlingen avser.',
    '- summary.projectType: projekt-/uppdragstyp om den står i texten, annars "".',
    '- summary.procurementForm: entreprenad-/upphandlingsform endast om explicit angiven, annars "".',
    '- requirements.must: endast obligatoriska SKA-krav.',
    '- requirements.should: endast utvärderande/meriterande BÖR-krav.',
    '- risks: endast oklarheter, saknad info eller flertydighet baserat på texten (inga gissningar).',
    '- openQuestions: frågor som bör ställas baserat på brister/oklarheter i texten.',
    '',
    'Returnera JSON i exakt detta format:',
    '{',
    '  "summary": { "description": "", "projectType": "", "procurementForm": "" },',
    '  "requirements": { "must": [ { "text": "", "source": "" } ], "should": [ { "text": "", "source": "" } ] },',
    '  "risks": [ { "issue": "", "reason": "" } ],',
    '  "openQuestions": [ { "question": "", "reason": "" } ]',
    '}',
  ].join('\n');

  return { system, user };
}

function emptyFFUAnalysisResult(message) {
  const msg = message ? String(message) : '';
  return {
    summary: {
      description: msg,
      projectType: '',
      procurementForm: '',
    },
    requirements: {
      must: [],
      should: [],
    },
    risks: [],
    openQuestions: [],
  };
}

function normalizeFFUAnalysisResult(raw) {
  const obj = raw && typeof raw === 'object' ? raw : null;
  const summary = obj && obj.summary && typeof obj.summary === 'object' ? obj.summary : {};
  const requirements = obj && obj.requirements && typeof obj.requirements === 'object' ? obj.requirements : {};
  const mustArr = Array.isArray(requirements.must) ? requirements.must : [];
  const shouldArr = Array.isArray(requirements.should) ? requirements.should : [];
  const risksArr = Array.isArray(obj && obj.risks) ? obj.risks : [];
  const openArr = Array.isArray(obj && obj.openQuestions) ? obj.openQuestions : [];

  const normalizeReq = (r) => ({
    text: r && r.text != null ? String(r.text) : '',
    source: r && r.source != null ? String(r.source) : '',
  });
  const normalizeRisk = (r) => ({
    issue: r && r.issue != null ? String(r.issue) : '',
    reason: r && r.reason != null ? String(r.reason) : '',
  });
  const normalizeQ = (q) => ({
    question: q && q.question != null ? String(q.question) : '',
    reason: q && q.reason != null ? String(q.reason) : '',
  });

  return {
    summary: {
      description: summary.description != null ? String(summary.description) : '',
      projectType: summary.projectType != null ? String(summary.projectType) : '',
      procurementForm: summary.procurementForm != null ? String(summary.procurementForm) : '',
    },
    requirements: {
      must: mustArr.map(normalizeReq).filter((x) => x.text.trim()),
      should: shouldArr.map(normalizeReq).filter((x) => x.text.trim()),
    },
    risks: risksArr.map(normalizeRisk).filter((x) => x.issue.trim()),
    openQuestions: openArr.map(normalizeQ).filter((x) => x.question.trim()),
  };
}

async function callOpenAIForFFUAnalysis({ apiKey, system, user }) {
  // Use the Responses API style payload; fall back to chat-compatible parsing.
  const payload = {
    model: process.env.OPENAI_MODEL || readFunctionsConfigValue('openai.model', null) || 'gpt-4.1-mini',
    input: [
      { role: 'system', content: [{ type: 'text', text: system }] },
      { role: 'user', content: [{ type: 'text', text: user }] },
    ],
    // Encourage strict JSON output.
    text: { format: { type: 'json_object' } },
  };

  async function callResponsesApi() {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const rawText = await res.text();
    if (!res.ok) {
      const err = new Error(`OpenAI responses error: ${res.status} - ${rawText}`);
      err.status = res.status;
      err.body = rawText;
      throw err;
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_e) {
      throw new Error('OpenAI returned non-JSON response envelope');
    }

    const outputText = (typeof data.output_text === 'string' && data.output_text.trim()) ? data.output_text : null;
    if (outputText) return outputText;

    const out = Array.isArray(data.output) ? data.output : [];
    for (const item of out) {
      const content = Array.isArray(item && item.content) ? item.content : [];
      for (const c of content) {
        if (c && c.type === 'output_text' && typeof c.text === 'string' && c.text.trim()) return c.text;
        if (c && c.type === 'text' && typeof c.text === 'string' && c.text.trim()) return c.text;
      }
    }
    throw new Error('OpenAI response did not include output_text');
  }

  async function callChatCompletionsApi() {
    const chatPayload = {
      model: payload.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chatPayload),
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`OpenAI chat error: ${res.status} - ${rawText}`);
    }
    const data = JSON.parse(rawText);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) return content;
    throw new Error('OpenAI chat response missing message content');
  }

  try {
    return await callResponsesApi();
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    const status = e && typeof e.status === 'number' ? e.status : null;
    // Fallback when Responses API is unavailable/blocked/misconfigured.
    if (status === 404 || status === 400 || msg.toLowerCase().includes('responses')) {
      return await callChatCompletionsApi();
    }
    throw e;
  }
}

// AI: Analyze FFU (förfrågningsunderlag)
// Input: { companyId, projectId, files: [{id,name,type,extractedText}] }
// Output: FFUAnalysisResult JSON (exact schema; no extra keys)
exports.analyzeFFU = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const companyId = (data && data.companyId) ? String(data.companyId).trim() : '';
  const projectId = (data && data.projectId) ? String(data.projectId).trim() : '';
  const files = (data && Array.isArray(data.files)) ? data.files : [];
  if (!companyId || !projectId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId and projectId are required');
  }

  // Allow company members or global admins.
  const token = context.auth.token || {};
  const isGlobal = !!token.globalAdmin || !!token.superadmin || token.role === 'superadmin' || (token.companyId === 'MS Byggsystem' && (token.admin === true || token.role === 'admin'));
  const isMember = token.companyId === companyId;
  if (!isMember && !isGlobal) {
    throw new functions.https.HttpsError('permission-denied', 'Not allowed');
  }

  const normalizedFiles = (files || []).map((f) => ({
    id: f && f.id != null ? String(f.id).trim() : '',
    name: f && f.name != null ? String(f.name).trim() : '',
    type: f && f.type != null ? String(f.type).trim() : '',
    extractedText: f && f.extractedText != null ? String(f.extractedText) : '',
  }));

  if (normalizedFiles.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'files is required');
  }

  const nonEmpty = normalizedFiles.filter((f) => String(f.extractedText || '').trim());
  if (nonEmpty.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'No extractedText found in any file');
  }

  // Guardrails: keep prompt size bounded.
  const totalChars = nonEmpty.reduce((sum, f) => sum + String(f.extractedText || '').length, 0);
  const maxChars = Number(process.env.FFU_AI_MAX_CHARS || readFunctionsConfigValue('openai.max_chars', null) || 250_000);
  if (Number.isFinite(maxChars) && totalChars > maxChars) {
    throw new functions.https.HttpsError('invalid-argument', `Combined extractedText too large (${totalChars} chars). Reduce documents or split analysis.`);
  }

  const inputHash = sha256Hex(JSON.stringify({
    companyId,
    projectId,
    files: normalizedFiles.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      extractedText: f.extractedText,
    })),
  }));

  // Cache per project.
  const cacheRef = db.doc(`foretag/${companyId}/projects/${projectId}/ai/ffu_analysis`);
  try {
    const cacheSnap = await cacheRef.get().catch(() => null);
    if (cacheSnap && cacheSnap.exists) {
      const cached = cacheSnap.data() || {};
      if (cached && cached.inputHash === inputHash && cached.result && typeof cached.result === 'object') {
        return normalizeFFUAnalysisResult(cached.result);
      }
    }
  } catch (_e) {
    // Cache read failure should not block analysis.
  }

  const apiKey = getOpenAIKey();
  if (!apiKey) {
    console.error('analyzeFFU: missing OpenAI API key');
    return emptyFFUAnalysisResult('AI-analys är inte konfigurerad (saknar API-nyckel).');
  }

  const { system, user } = buildFFUPrompt({ companyId, projectId, files: normalizedFiles });

  let analysis;
  try {
    const output = await callOpenAIForFFUAnalysis({ apiKey, system, user });
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch (e) {
      throw new Error(`AI output is not valid JSON: ${e?.message || e}`);
    }
    analysis = normalizeFFUAnalysisResult(parsed);
  } catch (e) {
    console.error('analyzeFFU: AI call/parse failed', {
      message: String(e && e.message ? e.message : e),
      companyId,
      projectId,
      uid: context.auth.uid,
    });
    analysis = emptyFFUAnalysisResult('Kunde inte generera analys. Försök igen eller kontrollera underlaget.');
  }

  // Best-effort cache write.
  try {
    await cacheRef.set({
      inputHash,
      result: analysis,
      model: process.env.OPENAI_MODEL || readFunctionsConfigValue('openai.model', null) || 'gpt-4.1-mini',
      fileCount: normalizedFiles.length,
      nonEmptyFileCount: nonEmpty.length,
      totalChars,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: context.auth.uid,
    }, { merge: true });
  } catch (e) {
    console.warn('analyzeFFU: failed to write cache', String(e && e.message ? e.message : e));
  }

  return analysis;
});

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

async function getCompanySiteIdsFromConfig(companyId) {
  const cfgRef = db.doc(`foretag/${companyId}/sharepoint_system/config`);
  const snap = await cfgRef.get().catch(() => null);
  const cfg = snap && snap.exists ? (snap.data() || {}) : {};
  const sp = cfg.sharepoint && typeof cfg.sharepoint === 'object' ? cfg.sharepoint : {};
  const baseSiteId = sp.baseSite && sp.baseSite.siteId ? String(sp.baseSite.siteId).trim() : '';
  const workspaceSiteId = sp.workspaceSite && sp.workspaceSite.siteId ? String(sp.workspaceSite.siteId).trim() : '';
  return { baseSiteId: baseSiteId || null, workspaceSiteId: workspaceSiteId || null };
}

async function purgeCompanyFirestore(companyId) {
  const companyRef = db.doc(`foretag/${companyId}`);
  async function deleteCollection(colPath) {
    const colRef = db.collection(colPath);
    const snap = await colRef.get();
    const deletions = [];
    snap.forEach((d) => {
      deletions.push(d.ref.delete().catch(() => null));
    });
    await Promise.all(deletions);
  }
  const subcollections = [
    `foretag/${companyId}/profil`,
    `foretag/${companyId}/members`,
    `foretag/${companyId}/activity`,
    `foretag/${companyId}/controls`,
    `foretag/${companyId}/draft_controls`,
    `foretag/${companyId}/hierarki`,
    `foretag/${companyId}/mallar`,
    `foretag/${companyId}/byggdel_mallar`,
    `foretag/${companyId}/byggdel_hierarki`,
    `foretag/${companyId}/sharepoint_sites`,
    `foretag/${companyId}/sharepoint_navigation`,
    `foretag/${companyId}/sharepoint_system`,
  ];
  for (const path of subcollections) {
    await deleteCollection(path);
  }
  await companyRef.delete();
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

async function sendSupportEmail({ to, subject, text }) {
  const smtp = getSmtpConfig();
  if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass || !smtp.from) {
    return { ok: false, skipped: true, reason: 'SMTP not configured' };
  }
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: !!smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  await transport.sendMail({ from: smtp.from, to, subject, text });
  return { ok: true };
}

// Delete all Firebase Auth users that belong to a specific companyId
// (based on custom claims). This scans users in pages of 1000 which is
// fine for the expected scale of this project.
async function deleteAuthUsersForCompany(companyId) {
  const PROTECTED_USER_EMAILS = new Set([
    'marcus@msbyggsystem.se',
  ]);

  let nextPageToken = undefined;
  let deletedCount = 0;
  let failedCount = 0;
  const failures = [];

  do {
    // listUsers returns up to 1000 users at a time
    const res = await admin.auth().listUsers(1000, nextPageToken);
    const users = res && Array.isArray(res.users) ? res.users : [];

    const targets = users.filter((u) => {
      try {
        const claims = u && u.customClaims ? u.customClaims : {};
        if (!(claims && claims.companyId === companyId)) return false;
        const email = u && u.email ? String(u.email).toLowerCase() : '';
        if (email && PROTECTED_USER_EMAILS.has(email)) return false;
        return true;
      } catch (e) {
        return false;
      }
    });

    await Promise.all(targets.map(async (u) => {
      try {
        await admin.auth().deleteUser(u.uid);
        deletedCount += 1;
      } catch (e) {
        failedCount += 1;
        failures.push({ uid: u.uid, error: e && e.message ? e.message : e });
      }
    }));

    nextPageToken = res.pageToken;
  } while (nextPageToken);

  if (failedCount > 0) {
    console.warn('deleteAuthUsersForCompany: some deletes failed', { companyId, deletedCount, failedCount, failures });
  } else {
    console.log('deleteAuthUsersForCompany: completed', { companyId, deletedCount });
  }

  return { deletedCount, failedCount };
}


