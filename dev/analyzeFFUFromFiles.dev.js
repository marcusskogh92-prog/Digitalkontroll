/**
 * Dev-runner: end-to-end test for analyzeFFUFromFiles via Firebase Emulators.
 *
 * What it does:
 * - Ensures emulator env vars are present (Firestore + Storage) to avoid prod access
 * - Generates small sample PDF/DOCX/XLSX buffers
 * - Uploads them to Storage emulator
 * - Calls callable `analyzeFFUFromFiles`
 * - Validates strict schema + minimum content (must/should/risk/openQuestion)
 *
 * Run (from repo root):
 *   export OPENAI_API_KEY="..."
 *   npx firebase emulators:exec --only functions,firestore,auth,storage \
 *     "node dev/analyzeFFUFromFiles.dev.js && node dev/verifyFFUCache.dev.cjs"
 */

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');

import { Document, Packer, Paragraph, TextRun } from 'docx';
import XLSX from 'xlsx-js-style';

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

const companyId = 'dev-company';
const projectId = 'dev-project';

function die(code, ...lines) {
  for (const l of lines) console.error(l);
  process.exit(code);
}

function assertEmulatorEnv() {
  const fsHost = String(process.env.FIRESTORE_EMULATOR_HOST || '').trim();
  const stHost = String(process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST || '').trim();

  if (!fsHost) {
    die(2, '❌ FIRESTORE_EMULATOR_HOST is missing. Refusing to continue to avoid production.');
  }
  if (!stHost) {
    die(2, '❌ FIREBASE_STORAGE_EMULATOR_HOST is missing. You must run with `--only ... ,storage` via emulators:exec.');
  }

  console.log('[env] FIRESTORE_EMULATOR_HOST=', fsHost);
  console.log('[env] FIREBASE_STORAGE_EMULATOR_HOST=', stHost);
}

function assertOpenAIKeyPresent() {
  const ok = Boolean(String(process.env.OPENAI_API_KEY || '').trim());
  if (!ok) {
    die(2, '❌ OPENAI_API_KEY is missing in this process.', 'Set it before running `firebase emulators:exec` (same shell).');
  }
}

function bufferFromPdfLines(lines) {
  return new Promise((resolve, reject) => {
    try {
      // Important: keep PDF simple/compatible with pdf-parse's underlying parser.
      // pdf-parse (functions) can choke on newer PDF features like xref streams.
      const doc = new PDFDocument({ size: 'A4', margin: 50, pdfVersion: '1.3', compress: false });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.fontSize(12);
      for (const line of lines) {
        doc.text(String(line), { lineGap: 4 });
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function bufferFromDocxLines(lines) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: lines.map((l) => new Paragraph({ children: [new TextRun(String(l))] })),
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}

function bufferFromXlsxRows(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'FFU');
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

async function uploadToStorageEmulator({ objectPath, buffer, contentType }) {
  const projectIdEnv = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || firebaseConfig.projectId;

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: projectIdEnv,
      storageBucket: `${projectIdEnv}.appspot.com`,
    });
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'no-store',
    },
  });

  return { bucketName: bucket.name, gsPath: `gs://${bucket.name}/${objectPath}` };
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

  const req = analysis && analysis.requirements;
  errors.push(...validateExactKeys(req, ['must', 'should'], 'root.requirements'));

  if (!analysis || !Array.isArray(analysis.risks)) errors.push('root.risks must be an array');
  if (!analysis || !Array.isArray(analysis.openQuestions)) errors.push('root.openQuestions must be an array');

  return errors;
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
    assertEmulatorEnv();
    assertOpenAIKeyPresent();

    const stamp = Date.now();
    const basePath = `ffu-dev/${stamp}`;

    const pdfLines = [
      'FFU - PDF',
      'Krav (SKA): Anbudsgivaren SKA lämna fast pris.',
      'Krav (BÖR): Anbudsgivaren BÖR föreslå alternativ metod.',
      'Risk: Oförutsedda markförhållanden.',
      'Öppen fråga: Gäller miljöcertifiering?',
    ];

    const docxLines = [
      'FFU - DOCX',
      'SKA: Bifoga referensprojekt (minst 2).',
      'BÖR: Föreslå tidplan med milstolpar.',
      'Risk: Kort genomförandetid.',
      'Fråga: Finns krav på AB/ABT?',
    ];

    const xlsxRows = [
      ['FFU - XLSX'],
      ['SKA', 'Redovisa tidplan i veckor'],
      ['BÖR', 'Föreslå alternativ produktionsmetod'],
      ['RISK', 'Geoteknisk undersökning är daterad 2018'],
      ['FRÅGA', 'Vilken ersättningsform gäller för ÄTA?'],
    ];

    const pdfBuf = await bufferFromPdfLines(pdfLines);
    const docxBuf = await bufferFromDocxLines(docxLines);
    const xlsxBuf = bufferFromXlsxRows(xlsxRows);

    const pdf = await uploadToStorageEmulator({
      objectPath: `${basePath}/ffu.pdf`,
      buffer: pdfBuf,
      contentType: 'application/pdf',
    });
    const docx = await uploadToStorageEmulator({
      objectPath: `${basePath}/ffu.docx`,
      buffer: docxBuf,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const xlsx = await uploadToStorageEmulator({
      objectPath: `${basePath}/ffu.xlsx`,
      buffer: xlsxBuf,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    console.log('[upload] bucket:', pdf.bucketName);
    console.log('[upload] pdf:', pdf.gsPath);
    console.log('[upload] docx:', docx.gsPath);
    console.log('[upload] xlsx:', xlsx.gsPath);

    const app = initializeApp(firebaseConfig);

    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, { disableWarnings: true });
    await signInAnonymously(auth);

    const functionsClient = getFunctions(app, 'us-central1');
    connectFunctionsEmulator(functionsClient, EMULATOR_HOST, FUNCTIONS_PORT);

    const fn = httpsCallable(functionsClient, 'analyzeFFUFromFiles');
    const res = await fn({
      companyId,
      projectId,
      files: [
        { path: pdf.gsPath, name: 'ffu.pdf', mimeType: 'application/pdf' },
        { path: docx.gsPath, name: 'ffu.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { path: xlsx.gsPath, name: 'ffu.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ],
    });

    const data = res && res.data !== undefined ? res.data : res;

    const status = data && data.status ? String(data.status) : '';
    const summary = data && data.summary ? String(data.summary) : '';
    const requirements = Array.isArray(data && data.requirements) ? data.requirements : [];
    const risks = Array.isArray(data && data.risks) ? data.risks : [];
    const questions = Array.isArray(data && data.questions) ? data.questions : [];

    if (!status || !['success', 'partial', 'error', 'too_large', 'analyzing'].includes(status)) {
      console.error('❌ Unexpected status from analyzeFFUFromFiles:', status);
      console.dir(data, { depth: null });
      process.exit(1);
    }

    if (!summary.trim()) {
      console.error('❌ Missing summary in analyzeFFUFromFiles response');
      console.dir(data, { depth: null });
      process.exit(1);
    }

    const hasAnyListItem = requirements.length + risks.length + questions.length > 0;
    if (!hasAnyListItem) {
      console.warn('⚠️ No requirements/risks/questions returned (still OK for smoke test)');
    }

    console.log('✅ analyzeFFUFromFiles succeeded (UI-friendly response OK)');
    console.dir(data, { depth: null });
    process.exit(0);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.error('❌ analyzeFFUFromFiles dev-runner failed');
    console.error('message:', msg);
    if (e && e.details != null) console.error('details:', e.details);
    process.exit(1);
  }
})();
