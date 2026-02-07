/**
 * Dev-test (utan UI) för callable `analyzeFFU` via Firebase Emulators.
 *
 * Syfte:
 * - Verifiera att Cloud Function `analyzeFFU` svarar med korrekt schema (JSON)
 * - Verifiera att prompt + AI-logik körs end-to-end
 *
 * Körning:
 * 1) Starta emulators (Functions + Auth):
 *    - cd functions && npm run serve
 * 2) Sätt OpenAI-nyckel i emulatorn (exempel):
 *    - export OPENAI_API_KEY="..."
 * 3) Kör scriptet:
 *    - node dev/analyzeFFU.dev.js
 *
 * Ändra test-texter:
 * - Redigera `files` nedan (extractedText).
 */

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyDI7SzOdfwV6wx0Igs8-Kdb8Zhuxwm7BWk',
  authDomain: 'digitalkontroll-8fd05.firebaseapp.com',
  projectId: 'digitalkontroll-8fd05',
  storageBucket: 'digitalkontroll-8fd05.firebasestorage.app',
  messagingSenderId: '753073457092',
  appId: '1:753073457092:web:937d55d391cbe78be40691',
  measurementId: 'G-EF1JRB9Y2E',
};

const EMULATOR_HOST = process.env.DK_EMULATOR_HOST || '127.0.0.1';
const FUNCTIONS_PORT = Number(process.env.DK_FUNCTIONS_PORT || 5001);
const AUTH_PORT = Number(process.env.DK_AUTH_PORT || 9099);

const REQUIRE_REAL_AI = process.env.DK_REQUIRE_REAL_AI !== '0';

// Mock-data (enligt uppdrag)
const companyId = 'dev-company';
const projectId = 'dev-project';
const files = [
  {
    name: 'AF-del.txt',
    type: 'text/plain',
    extractedText: [
      'ADMINISTRATIVA FÖRESKRIFTER (AF)',
      '',
      'Omfattning: Entreprenaden avser mark- och grundläggningsarbeten vid Nybyggnation X.',
      '',
      'Krav (SKA):',
      '- Anbudsgivaren SKA lämna fast pris för hela entreprenaden.',
      '- Anbudsgivaren SKA redovisa tidplan i veckor med start- och slutdatum.',
      '- Anbudsgivaren SKA bifoga referensprojekt (minst 2 st) från de senaste 5 åren.',
      '',
      'Krav (BÖR):',
      '- Anbudsgivaren BÖR föreslå en alternativ tidsoptimerad produktionsmetod.',
      '',
      'Oklarhet:',
      '- Det framgår inte om ersättningsform är fast pris eller mängdreglering för ÄTA.',
    ].join('\n')
  },
  {
    name: 'Teknisk-beskrivning.txt',
    type: 'text/plain',
    extractedText: [
      'TEKNISK BESKRIVNING (TB)',
      '',
      'Arbetet omfattar mark, schakt, fyllning, grundläggning och stomme.',
      '',
      'Tekniska krav (SKA):',
      '- Betongkvalitet SKA minst vara C30/37 för platta på mark.',
      '',
      'Risk:',
      '- Risk för oförutsedda markförhållanden då geoteknisk undersökning är daterad 2018.',
      '',
      'Öppen fråga:',
      '- Finns krav på miljöcertifiering (t.ex. ISO 14001) eller likvärdigt?',
    ].join('\n')
  }
];

function mapMimeToFFUType(mimeOrType) {
  const t = String(mimeOrType || '').trim().toLowerCase();
  if (t === 'pdf' || t === 'docx' || t === 'xlsx' || t === 'txt') return t;
  if (t === 'text/plain') return 'txt';
  if (t === 'application/pdf') return 'pdf';
  if (t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  return 'txt';
}

async function analyzeFFURemote(functionsClient, companyIdArg, projectIdArg, filesArg) {
  const cid = companyIdArg != null ? String(companyIdArg).trim() : '';
  const pid = projectIdArg != null ? String(projectIdArg).trim() : '';
  if (!cid) throw new Error('analyzeFFU: companyId is required');
  if (!pid) throw new Error('analyzeFFU: projectId is required');
  if (!Array.isArray(filesArg) || filesArg.length === 0) throw new Error('analyzeFFU: files must be a non-empty array');

  const normalizedFiles = filesArg.map((f, idx) => {
    const name = f && f.name != null ? String(f.name).trim() : '';
    const type = mapMimeToFFUType(f && f.type != null ? f.type : '');
    const extractedText = f && f.extractedText != null ? String(f.extractedText) : '';
    if (!name) throw new Error(`analyzeFFU: files[${idx}].name is required`);
    return {
      id: `file-${idx + 1}`,
      name,
      type,
      extractedText,
    };
  });

  const hasAnyText = normalizedFiles.some((f) => String(f.extractedText || '').trim().length > 0);
  if (!hasAnyText) throw new Error('analyzeFFU: no extractedText found in any file');

  const fn = httpsCallable(functionsClient, 'analyzeFFU');
  const res = await fn({ companyId: cid, projectId: pid, files: normalizedFiles });
  const payload = (res && res.data !== undefined) ? res.data : res;
  return { data: payload, fromCache: false };
}

function validateExactKeys(obj, allowedKeys, path) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    errors.push(`${path} must be an object`);
    return errors;
  }
  const keys = Object.keys(obj);
  for (const k of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) errors.push(`${path}.${k} is required`);
  }
  for (const k of keys) {
    if (!allowedKeys.includes(k)) errors.push(`${path}.${k} is not allowed`);
  }
  return errors;
}

function validateFFUAnalysisSchema(analysis) {
  const errors = [];
  errors.push(...validateExactKeys(analysis, ['summary', 'requirements', 'risks', 'openQuestions'], 'root'));

  const summary = analysis && analysis.summary;
  errors.push(...validateExactKeys(summary, ['description', 'projectType', 'procurementForm'], 'root.summary'));
  if (summary && typeof summary.description !== 'string') errors.push('root.summary.description must be a string');
  if (summary && typeof summary.projectType !== 'string') errors.push('root.summary.projectType must be a string');
  if (summary && typeof summary.procurementForm !== 'string') errors.push('root.summary.procurementForm must be a string');

  const req = analysis && analysis.requirements;
  errors.push(...validateExactKeys(req, ['must', 'should'], 'root.requirements'));
  if (req && !Array.isArray(req.must)) errors.push('root.requirements.must must be an array');
  if (req && !Array.isArray(req.should)) errors.push('root.requirements.should must be an array');
  for (let i = 0; req && Array.isArray(req.must) && i < req.must.length; i++) {
    const item = req.must[i];
    errors.push(...validateExactKeys(item, ['text', 'source'], `root.requirements.must[${i}]`));
    if (item && typeof item.text !== 'string') errors.push(`root.requirements.must[${i}].text must be a string`);
    if (item && typeof item.source !== 'string') errors.push(`root.requirements.must[${i}].source must be a string`);
  }
  for (let i = 0; req && Array.isArray(req.should) && i < req.should.length; i++) {
    const item = req.should[i];
    errors.push(...validateExactKeys(item, ['text', 'source'], `root.requirements.should[${i}]`));
    if (item && typeof item.text !== 'string') errors.push(`root.requirements.should[${i}].text must be a string`);
    if (item && typeof item.source !== 'string') errors.push(`root.requirements.should[${i}].source must be a string`);
  }

  if (!analysis || !Array.isArray(analysis.risks)) errors.push('root.risks must be an array');
  if (!analysis || !Array.isArray(analysis.openQuestions)) errors.push('root.openQuestions must be an array');

  for (let i = 0; analysis && Array.isArray(analysis.risks) && i < analysis.risks.length; i++) {
    const item = analysis.risks[i];
    errors.push(...validateExactKeys(item, ['issue', 'reason'], `root.risks[${i}]`));
    if (item && typeof item.issue !== 'string') errors.push(`root.risks[${i}].issue must be a string`);
    if (item && typeof item.reason !== 'string') errors.push(`root.risks[${i}].reason must be a string`);
  }

  for (let i = 0; analysis && Array.isArray(analysis.openQuestions) && i < analysis.openQuestions.length; i++) {
    const item = analysis.openQuestions[i];
    errors.push(...validateExactKeys(item, ['question', 'reason'], `root.openQuestions[${i}]`));
    if (item && typeof item.question !== 'string') errors.push(`root.openQuestions[${i}].question must be a string`);
    if (item && typeof item.reason !== 'string') errors.push(`root.openQuestions[${i}].reason must be a string`);
  }

  return errors;
}

function classifyResultSource(analysis) {
  const desc = String(analysis?.summary?.description || '');
  if (desc.includes('saknar API-nyckel')) return 'fallback:missing_api_key';
  if (desc.toLowerCase().includes('kunde inte generera analys')) return 'fallback:ai_error';
  return 'ai_or_cached';
}

function assertMinimumContent(analysis) {
  const mustCount = Array.isArray(analysis?.requirements?.must) ? analysis.requirements.must.length : 0;
  const shouldCount = Array.isArray(analysis?.requirements?.should) ? analysis.requirements.should.length : 0;
  const riskCount = Array.isArray(analysis?.risks) ? analysis.risks.length : 0;
  const questionCount = Array.isArray(analysis?.openQuestions) ? analysis.openQuestions.length : 0;

  const errors = [];
  if (mustCount < 1) errors.push('Expected at least 1 item in requirements.must');
  if (shouldCount < 1) errors.push('Expected at least 1 item in requirements.should');
  if (riskCount < 1) errors.push('Expected at least 1 item in risks');
  if (questionCount < 1) errors.push('Expected at least 1 item in openQuestions');

  return { errors, counts: { mustCount, shouldCount, riskCount, questionCount } };
}

(async () => {
  try {
    const hasOpenAIKeyInThisProcess = Boolean(String(process.env.OPENAI_API_KEY || '').trim());
    if (!hasOpenAIKeyInThisProcess) {
      console.error('❌ OPENAI_API_KEY is missing in this process.');
      console.error('This Step 2 run is expected to fail and return fallback:missing_api_key.');
      console.error('Set it before running `firebase emulators:exec` (same shell).');
      process.exit(2);
    }

    const app = initializeApp(firebaseConfig);

    // Auth emulator
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, { disableWarnings: true });
    await signInAnonymously(auth);

    // Functions emulator
    const functionsClient = getFunctions(app, 'us-central1');
    connectFunctionsEmulator(functionsClient, EMULATOR_HOST, FUNCTIONS_PORT);

    const result = await analyzeFFURemote(functionsClient, companyId, projectId, files);

    const schemaErrors = validateFFUAnalysisSchema(result?.data);
    if (schemaErrors.length > 0) {
      console.error('❌ Schema validation failed');
      for (const err of schemaErrors) console.error('-', err);
      console.log('\nReturned payload:');
      console.dir(result, { depth: null });
      process.exit(1);
    }

    const source = classifyResultSource(result?.data);
    if (REQUIRE_REAL_AI && source.startsWith('fallback:')) {
      console.error(`❌ analyzeFFU returned fallback (${source})`);
      console.dir(result, { depth: null });
      process.exit(3);
    }

    if (source.startsWith('fallback:')) {
      console.warn(`⚠️ analyzeFFU returned fallback (${source})`);
    } else {
      console.log('✅ analyzeFFU appears to be AI output (or cached)');
    }

    const { errors: minErrors, counts } = assertMinimumContent(result?.data);
    if (minErrors.length > 0) {
      console.error('❌ Minimum-content checks failed');
      console.error('Counts:', counts);
      for (const err of minErrors) console.error('-', err);
      console.dir(result, { depth: null });
      process.exit(4);
    }

    console.log('✅ analyzeFFU succeeded');
    console.dir(result, { depth: null });
    process.exit(0);
  } catch (e) {
    const code = e && typeof e.code === 'string' ? e.code : null;
    const msg = e && typeof e.message === 'string' ? e.message : String(e);
    console.error('❌ analyzeFFU failed');
    if (code) console.error('code:', code);
    console.error('message:', msg);
    if (e && e.details != null) console.error('details:', e.details);

    console.error('\nTips:');
    console.error(`- Säkerställ att emulators kör (Functions:${FUNCTIONS_PORT}, Auth:${AUTH_PORT})`);
    console.error('- Säkerställ att OPENAI_API_KEY är satt i emulator-processen');
    process.exit(1);
  }
})();
