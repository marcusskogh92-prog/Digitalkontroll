const functions = require('firebase-functions');

const { admin, db, FieldValue } = require('./sharedFirebase');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const { extractTextByMimeType } = require('./services/fileTextExtractor');

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';

const { syncSharePointSiteVisibility, upsertCompanySharePointSiteMeta } = require('./sharepointVisibility');
const { provisionCompanyImpl } = require('./companyProvisioning');
const { createUser, deleteUser, updateUser } = require('./userAdmin');
const { requestSubscriptionUpgrade } = require('./billing');
const { setSuperadmin } = require('./superadmin');
const { adminFetchCompanyMembers, setCompanyStatus, setCompanyUserLimit, setCompanyName } = require('./companyAdmin');
const { purgeCompany } = require('./companyPurge');
const { devResetAdmin } = require('./devReset');
const { deleteProject, deleteFolder } = require('./deleteOperations');

exports.syncSharePointSiteVisibility = functions.https.onCall(syncSharePointSiteVisibility);
exports.upsertCompanySharePointSiteMeta = functions.https.onCall(upsertCompanySharePointSiteMeta);

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

exports.deleteProject = functions.https.onCall(deleteProject);
exports.deleteFolder = functions.https.onCall(deleteFolder);

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
async function analyzeFFUCore({ companyId, projectId, files, uid }) {
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
    const model = process.env.OPENAI_MODEL || readFunctionsConfigValue('openai.model', null) || 'gpt-4.1-mini';
    console.log('[FFU] Step 3: Calling OpenAI', { model });
    const output = await callOpenAIForFFUAnalysis({ apiKey, system, user });
    console.log('[FFU] Step 4: OpenAI response received');
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
      uid,
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
      updatedBy: uid,
    }, { merge: true });
    console.log('[FFU] Step 5: Cache written');
  } catch (e) {
    console.warn('analyzeFFU: failed to write cache', String(e && e.message ? e.message : e));
  }

  return analysis;
}

function assertAnalyzeFFUPermission({ companyId, context }) {
  const token = (context && context.auth && context.auth.token) ? context.auth.token : {};
  const isGlobal =
    !!token.globalAdmin ||
    !!token.superadmin ||
    token.role === 'superadmin' ||
    (token.companyId === 'MS Byggsystem' && (token.admin === true || token.role === 'admin'));
  const isMember = token.companyId === companyId;
  // Emulator convenience: allow any authenticated caller to test the analysis flow.
  if (!IS_EMULATOR && !isMember && !isGlobal) {
    throw new functions.https.HttpsError('permission-denied', 'Not allowed');
  }
}

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

  assertAnalyzeFFUPermission({ companyId, context });
  return analyzeFFUCore({ companyId, projectId, files, uid: context.auth.uid });
});

function parseGsPath(raw) {
  const s = String(raw || '').trim();
  if (!s.startsWith('gs://')) return null;
  const without = s.slice('gs://'.length);
  const firstSlash = without.indexOf('/');
  if (firstSlash <= 0) return null;
  const bucket = without.slice(0, firstSlash);
  const objectPath = without.slice(firstSlash + 1);
  return { bucket, objectPath };
}

function isStorageEmulated() {
  return Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST);
}

function guessMimeTypeFromName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (n.endsWith('.txt')) return 'text/plain';
  return '';
}

function isSupportedFFUFileName(name) {
  const n = String(name || '').trim().toLowerCase();
  return n.endsWith('.pdf') || n.endsWith('.docx') || n.endsWith('.xlsx') || n.endsWith('.txt');
}

async function resolveCompanyWorkspaceSiteId(companyId) {
  const cid = String(companyId || '').trim();
  if (!cid) return null;

  // Preferred canonical config (server-managed)
  try {
    const { workspaceSiteId } = await getCompanySiteIdsFromConfig(cid);
    if (workspaceSiteId) return String(workspaceSiteId).trim();
  } catch (_e) {}

  // Fallback: company profile linkage
  try {
    const profRef = db.doc(`foretag/${cid}/profil/public`);
    const snap = await profRef.get().catch(() => null);
    const d = snap && snap.exists ? (snap.data() || {}) : {};
    const primary = d.primarySharePointSite && typeof d.primarySharePointSite === 'object' ? d.primarySharePointSite : null;
    const fromPrimary = primary && primary.siteId ? String(primary.siteId).trim() : '';
    if (fromPrimary) return fromPrimary;
    const legacy = d.sharePointSiteId ? String(d.sharePointSiteId).trim() : '';
    if (legacy) return legacy;
  } catch (_e) {}

  return null;
}

async function ensureCompany5555SharePointSeedIfMissing(companyId) {
  const cid = String(companyId || '').trim();
  if (cid !== '5555') return { ok: true, seeded: false, siteId: await resolveCompanyWorkspaceSiteId(cid) };

  const existing = await resolveCompanyWorkspaceSiteId(cid);
  if (existing) return { ok: true, seeded: false, siteId: existing };

  const forcedSiteId =
    process.env.DK_DEV_COMPANY_5555_SITE_ID ||
    process.env.SHAREPOINT_SITE_ID_5555 ||
    readFunctionsConfigValue('sharepoint.dev_company_5555_site_id', null) ||
    readFunctionsConfigValue('sharepoint.devCompany5555SiteId', null);
  if (forcedSiteId) {
    const siteId = String(forcedSiteId).trim();
    if (!siteId) {
      return { ok: false, seeded: false, siteId: null, reason: 'Forced siteId was empty' };
    }

    // Same seeding behavior as Graph-resolved, but without webUrl.
    const profRef = db.doc(`foretag/${cid}/profil/public`);
    const profSnap = await profRef.get().catch(() => null);
    const prof = profSnap && profSnap.exists ? (profSnap.data() || {}) : {};
    const companyName = String(prof?.companyName || prof?.name || cid).trim();

    try {
      const cfgRef = db.doc(`foretag/${cid}/sharepoint_system/config`);
      await cfgRef.set({
        sharepoint: {
          workspaceSite: {
            siteId,
            webUrl: null,
            type: 'workspace',
            visibility: 'company',
            siteName: companyName,
            siteSlug: null,
          },
          enabledSites: [siteId],
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'system-dev-seed',
      }, { merge: true });
    } catch (_e) {}

    try {
      await profRef.set({
        primarySharePointSite: {
          siteId,
          siteUrl: null,
          linkedAt: FieldValue.serverTimestamp(),
          linkedBy: 'system-dev-seed',
        },
        sharePointSiteId: siteId,
        sharePointWebUrl: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (_e) {}

    try {
      const metaRef = db.doc(`foretag/${cid}/sharepoint_sites/${siteId}`);
      await metaRef.set({
        siteId,
        siteUrl: null,
        siteName: companyName,
        role: 'projects',
        visibleInLeftPanel: true,
        systemManaged: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'system-dev-seed',
      }, { merge: true });
    } catch (_e) {}

    return { ok: true, seeded: true, siteId };
  }

  let accessToken = null;
  try {
    accessToken = await getSharePointGraphAccessToken();
  } catch (e) {
    return { ok: false, seeded: false, siteId: null, reason: String(e && e.message ? e.message : e) };
  }
  const hostname = getSharePointHostname();
  if (!accessToken || !hostname) {
    return { ok: false, seeded: false, siteId: null, reason: 'SharePoint Graph config missing (token/hostname)' };
  }

  // Best-effort: infer site slug from company display name (same rule as provisioning)
  const profRef = db.doc(`foretag/${cid}/profil/public`);
  const profSnap = await profRef.get().catch(() => null);
  const prof = profSnap && profSnap.exists ? (profSnap.data() || {}) : {};
  const companyName = String(prof?.companyName || prof?.name || cid).trim();
  const workspaceSlug = normalizeSharePointSiteSlug(companyName);
  if (!workspaceSlug) {
    return { ok: false, seeded: false, siteId: null, reason: 'Could not derive SharePoint site slug from company name' };
  }

  const resolved = await graphGetSiteByUrl({ hostname, siteSlug: workspaceSlug, accessToken });
  if (!resolved || !resolved.siteId) {
    return { ok: false, seeded: false, siteId: null, reason: `Graph could not resolve site by slug: ${workspaceSlug}` };
  }

  const siteId = String(resolved.siteId).trim();
  const webUrl = resolved.webUrl ? String(resolved.webUrl).trim() : null;

  // Seed canonical server config so other systems can reuse it.
  try {
    const cfgRef = db.doc(`foretag/${cid}/sharepoint_system/config`);
    await cfgRef.set({
      sharepoint: {
        workspaceSite: {
          siteId,
          webUrl,
          type: 'workspace',
          visibility: 'company',
          siteName: companyName,
          siteSlug: workspaceSlug,
        },
        enabledSites: [siteId],
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'system-dev-seed',
    }, { merge: true });
  } catch (_e) {}

  // Seed profile linkage for backwards compatibility
  try {
    await profRef.set({
      primarySharePointSite: {
        siteId,
        siteUrl: webUrl,
        linkedAt: FieldValue.serverTimestamp(),
        linkedBy: 'system-dev-seed',
      },
      sharePointSiteId: siteId,
      sharePointWebUrl: webUrl,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (_e) {}

  // Seed visibility metadata so left panel role resolution works
  try {
    const metaRef = db.doc(`foretag/${cid}/sharepoint_sites/${siteId}`);
    await metaRef.set({
      siteId,
      siteUrl: webUrl,
      siteName: companyName,
      role: 'projects',
      visibleInLeftPanel: true,
      systemManaged: true,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'system-dev-seed',
    }, { merge: true });
  } catch (_e) {}

  return { ok: true, seeded: true, siteId };
}

async function graphDownloadItemAsBuffer({ siteId, itemId, accessToken, maxBytes }) {
  const sid = String(siteId || '').trim();
  const iid = String(itemId || '').trim();
  if (!sid || !iid) throw new Error('siteId and itemId are required');

  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${sid}/drive/items/${iid}/content`, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Graph download failed: ${res.status} - ${txt}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const limit = Number.isFinite(Number(maxBytes)) ? Number(maxBytes) : (20 * 1024 * 1024);
  if (Number.isFinite(limit) && buf.length > limit) {
    throw new Error(`File too large to extract (${buf.length} bytes > ${limit})`);
  }
  return { buffer: buf, sizeBytes: buf.length };
}

async function graphListFilesRecursive({ siteId, rootPath, accessToken, maxDepth, maxFiles }) {
  const sid = String(siteId || '').trim();
  const base = String(rootPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  if (!sid || !base) return [];

  const depthLimit = Number.isFinite(Number(maxDepth)) ? Number(maxDepth) : 8;
  const fileLimit = Number.isFinite(Number(maxFiles)) ? Number(maxFiles) : 25;

  const out = [];
  async function walk(path, depth) {
    if (out.length >= fileLimit) return;
    if (depth > depthLimit) return;

    const children = await graphGetChildren({ siteId: sid, path, accessToken });
    for (const item of children || []) {
      if (out.length >= fileLimit) return;
      const name = String(item?.name || '').trim();
      if (!name) continue;
      const isFolder = !!item?.folder;
      const isFile = !!item?.file;
      const childPath = path ? `${path}/${name}` : name;
      if (isFolder) {
        await walk(childPath, depth + 1);
        continue;
      }
      if (!isFile) continue;
      if (!isSupportedFFUFileName(name)) continue;
      if (!item?.id) continue;
      out.push({
        id: String(item.id),
        name,
        path: childPath,
        sizeBytes: item?.size != null ? Number(item.size) : null,
      });
    }
  }

  await walk(base, 0);
  return out;
}

async function getProjectSharePointBasePath({ companyId, projectId }) {
  const cid = String(companyId || '').trim();
  const pid = String(projectId || '').trim();
  if (!cid || !pid) return '';

  const ref = db.doc(`foretag/${cid}/projects/${pid}`);
  const snap = await ref.get().catch(() => null);
  const p = snap && snap.exists ? (snap.data() || {}) : {};
  const base = String(
    p?.rootFolderPath ||
    p?.rootPath ||
    p?.sharePointRootPath ||
    p?.sharePointPath ||
    p?.sharepointPath ||
    p?.sharePointBasePath ||
    p?.sharepointBasePath ||
    p?.basePath ||
    ''
  ).trim();
  return base.replace(/^\/+/, '').replace(/\/+$/, '').trim();
}

async function downloadStorageObjectAsBuffer({ bucketName, objectPath }) {
  // Never trust a bucket name coming from the client. Always use the default bucket.
  // This also prevents accidentally downloading from an unexpected bucket.
  void bucketName;
  const b = admin.storage().bucket();
  const file = b.file(objectPath);

  const [meta] = await file.getMetadata();
  const sizeBytes = meta && meta.size != null ? Number(meta.size) : null;
  const maxBytes = Number(process.env.FFU_EXTRACT_MAX_BYTES || 20 * 1024 * 1024);
  if (
    sizeBytes != null &&
    Number.isFinite(sizeBytes) &&
    Number.isFinite(maxBytes) &&
    sizeBytes > maxBytes
  ) {
    throw new Error(`File too large to extract (${sizeBytes} bytes > ${maxBytes})`);
  }

  const [buf] = await file.download();
  return {
    buffer: buf,
    sizeBytes: sizeBytes != null && Number.isFinite(sizeBytes) ? sizeBytes : buf.length,
  };
}

function truncateExtractedFilesToMaxChars(extractedFiles, maxTotalChars) {
  const maxChars = Number(maxTotalChars);
  if (!Number.isFinite(maxChars) || maxChars <= 0) {
    return { files: Array.isArray(extractedFiles) ? extractedFiles : [], usedChars: 0, truncated: false, filesUsed: 0 };
  }

  const input = Array.isArray(extractedFiles) ? extractedFiles : [];
  const out = [];
  let used = 0;
  for (const f of input) {
    if (used >= maxChars) break;
    const text = String(f?.extractedText || '');
    if (!text) continue;
    const remaining = maxChars - used;
    const sliced = text.length > remaining ? text.slice(0, remaining) : text;
    used += sliced.length;
    out.push({
      id: f?.id != null ? String(f.id) : '',
      name: f?.name != null ? String(f.name) : '',
      type: f?.type != null ? String(f.type) : '',
      extractedText: sliced,
    });
  }

  const originalTotal = input.reduce((sum, f) => sum + String(f?.extractedText || '').length, 0);
  return {
    files: out,
    usedChars: used,
    truncated: originalTotal > used,
    filesUsed: out.length,
  };
}

function uiFriendlyFFUResult({ status, analysis, meta, fallbackSummary }) {
  const a = analysis && typeof analysis === 'object' ? analysis : null;
  const summary = String(a?.summary?.description || '').trim();

  const must = Array.isArray(a?.requirements?.must) ? a.requirements.must : [];
  const should = Array.isArray(a?.requirements?.should) ? a.requirements.should : [];
  const requirements = [...must, ...should]
    .map((r) => String(r?.text || '').trim())
    .filter(Boolean);

  const risks = (Array.isArray(a?.risks) ? a.risks : [])
    .map((r) => {
      const issue = String(r?.issue || '').trim();
      const reason = String(r?.reason || '').trim();
      if (!issue && !reason) return '';
      if (issue && reason) return `${issue} — ${reason}`;
      return issue || reason;
    })
    .filter(Boolean);

  const questions = (Array.isArray(a?.openQuestions) ? a.openQuestions : [])
    .map((q) => {
      const question = String(q?.question || '').trim();
      const reason = String(q?.reason || '').trim();
      if (!question && !reason) return '';
      if (question && reason) return `${question} — ${reason}`;
      return question || reason;
    })
    .filter(Boolean);

  const safeSummary = summary || String(fallbackSummary || 'AI kunde inte skapa en sammanfattning, men analysen kördes.').trim();
  return {
    status: status || 'success',
    summary: safeSummary,
    requirements: Array.isArray(requirements) ? requirements : [],
    risks: Array.isArray(risks) ? risks : [],
    questions: Array.isArray(questions) ? questions : [],
    meta: {
      totalChars: Number(meta?.totalChars) || 0,
      filesUsed: Number(meta?.filesUsed) || 0,
      truncated: Boolean(meta?.truncated),
    },
  };
}

function buildPersistedFFUAnalysisDoc({ status, analysis, meta, fallbackSummary, model }) {
  const a = analysis && typeof analysis === 'object' ? analysis : null;
  const summary = a ? String(a?.summary?.description || '').trim() : '';

  const must = Array.isArray(a?.requirements?.must) ? a.requirements.must : [];
  const should = Array.isArray(a?.requirements?.should) ? a.requirements.should : [];
  const ska = must.map((r) => String(r?.text || '').trim()).filter(Boolean);
  const bor = should.map((r) => String(r?.text || '').trim()).filter(Boolean);

  const risks = (Array.isArray(a?.risks) ? a.risks : [])
    .map((r) => {
      const issue = String(r?.issue || '').trim();
      const reason = String(r?.reason || '').trim();
      if (!issue && !reason) return '';
      if (issue && reason) return `${issue} — ${reason}`;
      return issue || reason;
    })
    .filter(Boolean);

  const questions = (Array.isArray(a?.openQuestions) ? a.openQuestions : [])
    .map((q) => {
      const question = String(q?.question || '').trim();
      const reason = String(q?.reason || '').trim();
      if (!question && !reason) return '';
      if (question && reason) return `${question} — ${reason}`;
      return question || reason;
    })
    .filter(Boolean);

  const safeSummary = summary || String(fallbackSummary || 'AI kunde inte skapa en sammanfattning, men analysen kördes.').trim();
  const m = String(model || '').trim();

  return {
    status: status || 'success',
    summary: safeSummary,
    requirements: {
      ska,
      bor,
    },
    risks,
    questions,
    meta: {
      totalChars: Number(meta?.totalChars) || 0,
      filesUsed: Number(meta?.filesUsed) || 0,
      truncated: Boolean(meta?.truncated),
    },
    analyzedAt: FieldValue.serverTimestamp(),
    model: m || 'gpt-4.1-mini',
  };
}

async function persistFFUAnalysisLatest({ companyId, projectId, doc }) {
  const canonicalRef = db.doc(`companies/${companyId}/projects/${projectId}/ai_ffu_analysis/latest`);
  const legacyRef = db.doc(`foretag/${companyId}/projects/${projectId}/ai_ffu_analysis/latest`);

  await canonicalRef.set(doc, { merge: false });
  // Mirror write for older clients/paths (best-effort).
  await legacyRef.set(doc, { merge: false }).catch(() => null);

  const snap = await canonicalRef.get();
  return snap && snap.exists ? (snap.data() || {}) : (doc || {});
}

// AI: Analyze FFU from uploaded files (Storage paths)
// Input: { companyId, projectId, files: [{ path, name, mimeType }] }
// Output: FFUAnalysisResult JSON (exact schema; no extra keys)
exports.analyzeFFUFromFiles = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB',
  })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const startedAtMs = Date.now();

  const companyId = (data && data.companyId) ? String(data.companyId).trim() : '';
  const projectId = (data && data.projectId) ? String(data.projectId).trim() : '';
  console.log('[analyzeFFUFromFiles] callable invoked', { companyId, projectId });
  const files = (data && Array.isArray(data.files)) ? data.files : [];
  if (!companyId || !projectId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId and projectId are required');
  }

  assertAnalyzeFFUPermission({ companyId, context });

  // Mark analysis as running in Firestore (merge to preserve any previous content).
  try {
    const canonicalRef = db.doc(`companies/${companyId}/projects/${projectId}/ai_ffu_analysis/latest`);
    const legacyRef = db.doc(`foretag/${companyId}/projects/${projectId}/ai_ffu_analysis/latest`);
    const model = process.env.OPENAI_MODEL || readFunctionsConfigValue('openai.model', null) || 'gpt-4.1-mini';
    await canonicalRef.set({ status: 'analyzing', model, analyzingAt: FieldValue.serverTimestamp() }, { merge: true });
    await legacyRef.set({ status: 'analyzing', model, analyzingAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => null);
  } catch (e) {
    console.warn('[FFU] Failed to set analyzing status', { message: String(e && e.message ? e.message : e) });
  }

  // Debug (temporary): verify what SharePoint config is visible in runtime.
  // NOTE: never log secrets, only presence.
  try {
    const sp = (functions.config && typeof functions.config === 'function') ? ((functions.config() || {}).sharepoint || {}) : {};
    console.log('SHAREPOINT CONFIG CHECK', {
      tenantId: sp && sp.tenant_id ? sp.tenant_id : (sp && sp.tenantId ? sp.tenantId : null),
      clientId: sp && sp.client_id ? sp.client_id : (sp && sp.clientId ? sp.clientId : null),
      hasClientSecret: !!(sp && (sp.client_secret || sp.clientSecret)),
      hasStaticAccessToken: !!getSharePointProvisioningAccessToken(),
      hasHostname: !!getSharePointHostname(),
      isEmulator: !!IS_EMULATOR,
    });
  } catch (_e) {}

  const hasClientFiles = Array.isArray(files) && files.length > 0;
  const useSharePoint = !hasClientFiles;

  if (!useSharePoint && IS_EMULATOR && !isStorageEmulated()) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Storage emulator is not configured. Refusing to download files to avoid hitting production.'
    );
  }

  const minChars = Number(process.env.FFU_EXTRACT_MIN_CHARS || 30);
  const extractedFiles = [];

  if (useSharePoint) {
    const seed = await ensureCompany5555SharePointSeedIfMissing(companyId);
    if (!seed.ok) {
      throw new functions.https.HttpsError('failed-precondition', `SharePoint site config missing for company ${companyId}: ${seed.reason || 'unknown'}`);
    }

    let accessToken = null;
    try {
      accessToken = await getSharePointGraphAccessToken();
    } catch (e) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `SharePoint Graph access token is not configured (or could not be minted): ${String(e && e.message ? e.message : e)}`
      );
    }

    const siteId = seed.siteId || await resolveCompanyWorkspaceSiteId(companyId);
    if (!siteId) {
      throw new functions.https.HttpsError('failed-precondition', `Missing SharePoint workspace siteId for company ${companyId}`);
    }

    const basePath = await getProjectSharePointBasePath({ companyId, projectId });
    if (!basePath) {
      throw new functions.https.HttpsError('failed-precondition', `Project ${projectId} is missing SharePoint base path`);
    }

    const FORFRAGNINGSUNDERLAG_FOLDER = '02 - Förfrågningsunderlag';
    const ffuRootPath = `${basePath}/${FORFRAGNINGSUNDERLAG_FOLDER}`.replace(/^\/+/, '').replace(/\/+/, '/');

    const maxFiles = Number(process.env.FFU_SP_MAX_FILES || 10);
    const maxDepth = Number(process.env.FFU_SP_MAX_DEPTH || 8);
    const spFiles = await graphListFilesRecursive({ siteId, rootPath: ffuRootPath, accessToken, maxDepth, maxFiles });

    console.log('analyzeFFUFromFiles: sharepoint list summary', {
      companyId,
      projectId,
      siteIdHash: sha256Hex(siteId).slice(0, 12),
      ffuRootPathHash: sha256Hex(ffuRootPath).slice(0, 12),
      fileCount: spFiles.length,
      seededCompany5555: seed.seeded === true,
    });

    console.log('[FFU] Step 1: SharePoint listing done', { ms: Date.now() - startedAtMs, fileCount: Array.isArray(spFiles) ? spFiles.length : 0 });

    if (!Array.isArray(spFiles) || spFiles.length === 0) {
      throw new functions.https.HttpsError('failed-precondition', 'No FFU files found in SharePoint Förfrågningsunderlag');
    }

    const maxBytes = Number(process.env.FFU_EXTRACT_MAX_BYTES || 20 * 1024 * 1024);
    for (let i = 0; i < spFiles.length; i += 1) {
      const f = spFiles[i] || {};
      const name = String(f.name || '').trim();
      const mimeType = guessMimeTypeFromName(name);
      try {
        const { buffer, sizeBytes } = await graphDownloadItemAsBuffer({ siteId, itemId: f.id, accessToken, maxBytes });
        const { kind, text } = await extractTextByMimeType({ mimeType, buffer });
        const charLen = String(text || '').length;
        const pathHash = sha256Hex(String(f.path || '')).slice(0, 12);

        console.log('analyzeFFUFromFiles: extracted (sharepoint)', {
          index: i,
          name: name || null,
          mimeType: mimeType || null,
          kind,
          sizeBytes,
          charLen,
          pathHash,
        });

        if (!text || String(text).trim().length < minChars) {
          console.log('analyzeFFUFromFiles: ignoring short/empty extracted text (sharepoint)', { index: i, charLen, pathHash });
          continue;
        }

        extractedFiles.push({
          id: `sp-${String(f.id).slice(0, 16) || (i + 1)}`,
          name: name || `sharepoint-file-${i + 1}`,
          type: kind,
          extractedText: text,
        });
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        console.warn('analyzeFFUFromFiles: failed to extract sharepoint file (continuing)', { index: i, name: name || null, message: msg });
      }
    }
  } else {
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i] || {};
      const name = f.name != null ? String(f.name).trim() : '';
      const mimeType = f.mimeType != null ? String(f.mimeType).trim() : '';
      const rawPath = f.path != null ? String(f.path).trim() : '';

      if (!rawPath) {
        console.warn('analyzeFFUFromFiles: skipping file with missing path', { index: i, name: name || null });
        continue;
      }

      // No directory traversal.
      if (rawPath.includes('..')) {
        console.warn('analyzeFFUFromFiles: skipping file with suspicious path', { index: i, name: name || null });
        continue;
      }

      try {
        const gs = parseGsPath(rawPath);
        const bucketName = gs ? gs.bucket : null;
        const objectPath = gs ? gs.objectPath : rawPath.replace(/^\/+/, '');

        const { buffer, sizeBytes } = await downloadStorageObjectAsBuffer({ bucketName, objectPath });
        const { kind, text } = await extractTextByMimeType({ mimeType, buffer });
        const charLen = String(text || '').length;

        const pathHash = sha256Hex(rawPath).slice(0, 12);
        console.log('analyzeFFUFromFiles: extracted', {
          index: i,
          name: name || null,
          mimeType: mimeType || null,
          kind,
          sizeBytes,
          charLen,
          pathHash,
        });

        if (!text || String(text).trim().length < minChars) {
          console.log('analyzeFFUFromFiles: ignoring short/empty extracted text', { index: i, charLen, pathHash });
          continue;
        }

        extractedFiles.push({
          id: `file-${i + 1}`,
          name: name || `file-${i + 1}`,
          type: kind,
          extractedText: text,
        });
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        console.warn('analyzeFFUFromFiles: failed to extract file (continuing)', { index: i, name: name || null, mimeType: mimeType || null, message: msg });
      }
    }
  }

  const totalChars = extractedFiles.reduce((sum, f) => sum + String(f.extractedText || '').length, 0);
  console.log('analyzeFFUFromFiles: extraction summary', {
    inputFileCount: hasClientFiles ? files.length : null,
    sharepointMode: useSharePoint,
    extractedFileCount: extractedFiles.length,
    totalChars,
  });

  console.log('[FFU] Step 2: PDF extraction done', { ms: Date.now() - startedAtMs, totalChars });

  const defaultCap = 120_000;
  const capFromEnv = Number(process.env.FFU_MAX_TOTAL_CHARS || defaultCap);
  const coreCap = Number(process.env.FFU_AI_MAX_CHARS || readFunctionsConfigValue('openai.max_chars', null) || 250_000);
  const maxTotalChars = Number.isFinite(coreCap)
    ? Math.min(Number.isFinite(capFromEnv) ? capFromEnv : defaultCap, coreCap)
    : (Number.isFinite(capFromEnv) ? capFromEnv : defaultCap);

  const trunc = truncateExtractedFilesToMaxChars(extractedFiles, maxTotalChars);
  const status = trunc.truncated ? 'partial' : 'success';

  if (trunc.truncated) {
    console.warn('[FFU] Underlag truncated for AI analysis', {
      originalTotalChars: totalChars,
      usedChars: trunc.usedChars,
      filesUsed: trunc.filesUsed,
      maxTotalChars,
    });
  }

  const model = process.env.OPENAI_MODEL || readFunctionsConfigValue('openai.model', null) || 'gpt-4.1-mini';
  console.log('[FFU] Step 3: Calling OpenAI', { ms: Date.now() - startedAtMs, model, status });

  let analysis;
  try {
    analysis = await analyzeFFUCore({ companyId, projectId, files: trunc.files, uid: context.auth.uid });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    console.error('[FFU] analyzeFFUCore failed', { message: msg, companyId, projectId });
    console.log('[FFU] Step 4: OpenAI response received', { ms: Date.now() - startedAtMs, ok: false });

    // If we already have a successful analysis saved, keep the content but flip status -> error.
    let existing = null;
    try {
      const existingCanonical = await db.doc(`companies/${companyId}/projects/${projectId}/ai_ffu_analysis/latest`).get().catch(() => null);
      if (existingCanonical && existingCanonical.exists) existing = existingCanonical.data() || null;
      if (!existing) {
        const existingLegacy = await db.doc(`foretag/${companyId}/projects/${projectId}/ai_ffu_analysis/latest`).get().catch(() => null);
        if (existingLegacy && existingLegacy.exists) existing = existingLegacy.data() || null;
      }
    } catch (_e) {}

    const fallbackDoc = buildPersistedFFUAnalysisDoc({
      status: 'error',
      analysis: null,
      fallbackSummary: msg || 'AI-körningen misslyckades.',
      meta: { totalChars, filesUsed: trunc.filesUsed, truncated: trunc.truncated },
      model,
    });

    const docToSave = existing && typeof existing === 'object'
      ? {
          ...existing,
          status: 'error',
          meta: fallbackDoc.meta,
          analyzedAt: fallbackDoc.analyzedAt,
          model: fallbackDoc.model,
        }
      : fallbackDoc;

    const saved = await persistFFUAnalysisLatest({ companyId, projectId, doc: docToSave });
    console.log('[FFU] Analysis saved', { companyId, projectId, status: 'error' });
    return saved;
  }

  console.log('[FFU] Step 4: OpenAI response received', { ms: Date.now() - startedAtMs, ok: true });
  // Cache write is performed inside analyzeFFUCore (best-effort). Persist latest analysis for UI.
  const docToSave = buildPersistedFFUAnalysisDoc({
    status,
    analysis,
    meta: { totalChars, filesUsed: trunc.filesUsed, truncated: trunc.truncated },
    model,
  });
  const saved = await persistFFUAnalysisLatest({ companyId, projectId, doc: docToSave });
  console.log('[FFU] Analysis saved', { companyId, projectId, status });
  return saved;
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


