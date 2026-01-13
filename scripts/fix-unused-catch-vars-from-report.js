#!/usr/bin/env node
/*
  Fix ESLint warnings for unused catch parameters that must start with '_'.

  Usage:
    node scripts/fix-unused-catch-vars-from-report.js ./eslint-full.json

  Notes:
    - Only renames catch parameters when ESLint explicitly reports them as unused.
    - This avoids changing catch vars that are referenced inside the catch body.
*/

const fs = require('fs');
const path = require('path');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function extractVarName(message) {
  const m = String(message || '').match(/^'([^']+)' is defined but never used\./);
  return m ? m[1] : null;
}

function main() {
  const reportPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('eslint-full.json');
  if (!fs.existsSync(reportPath)) {
    console.error('Report file not found:', reportPath);
    process.exit(1);
  }

  const report = readJson(reportPath);
  const changedFiles = new Set();
  let changeCount = 0;

  for (const fileRes of report) {
    const filePath = fileRes.filePath;
    const messages = Array.isArray(fileRes.messages) ? fileRes.messages : [];

    const relevant = messages.filter((m) => {
      if (!m || !m.ruleId) return false;
      if (m.ruleId !== 'no-unused-vars' && m.ruleId !== '@typescript-eslint/no-unused-vars') return false;
      return String(m.message || '').includes('Allowed unused caught errors must match /^_/u');
    });

    if (relevant.length === 0) continue;
    if (!fs.existsSync(filePath)) continue;

    const src = fs.readFileSync(filePath, 'utf8');
    const lines = src.split(/\r?\n/);
    let fileChanged = false;

    for (const msg of relevant) {
      const varName = extractVarName(msg.message);
      if (!varName || varName.startsWith('_')) continue;
      const lineIdx = (msg.line || 0) - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) continue;

      const line = lines[lineIdx];
      // The identifier location for this warning points at the catch parameter.
      // Replace only the first occurrence after `catch(`.
      const re = new RegExp(`(\\bcatch\\s*\\(\\s*\\(?\\s*)${varName}\\b`);
      if (!re.test(line)) continue;

      lines[lineIdx] = line.replace(re, `$1_${varName}`);
      fileChanged = true;
      changeCount++;
    }

    if (fileChanged) {
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      changedFiles.add(filePath);
    }
  }

  console.log('Updated files:', changedFiles.size);
  console.log('Total catch-var renames:', changeCount);
}

main();
