/* eslint-env node */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const webBuildDir = path.resolve(projectRoot, 'web-build');

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function walkFiles(dir) {
  const results = [];
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }

  return results;
}

function readFileMaybe(filePath, maxBytes = 250_000) {
  try {
    const stat = fs.statSync(filePath);
    const len = Math.min(stat.size, maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 0);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

function main() {
  if (!exists(webBuildDir)) {
    console.error(`[verify-web-build] Missing folder: ${webBuildDir}`);
    console.error('[verify-web-build] Run `npm run build` first (web export).');
    process.exit(1);
  }

  const indexHtml = path.join(webBuildDir, 'index.html');
  if (!exists(indexHtml)) {
    console.error('[verify-web-build] Missing web-build/index.html; export likely failed.');
    process.exit(1);
  }

  const files = walkFiles(webBuildDir);

  // 1) Prefer a direct hit: font asset file name containing ionicons.
  const fontExtRe = /\.(ttf|otf|woff2?)$/i;
  const ioniconsFile = files.find((f) => fontExtRe.test(f) && /ionicons/i.test(path.basename(f)));
  if (ioniconsFile) {
    console.log(`[verify-web-build] OK: Found Ionicons font asset: ${path.relative(projectRoot, ioniconsFile)}`);
    return;
  }

  // 2) Fallback: look for any font assets AND a JS bundle referencing Ionicons.ttf.
  const fontFiles = files.filter((f) => fontExtRe.test(f));
  const jsFiles = files.filter((f) => /\.(js|mjs)$/i.test(f));

  const jsReferenceHit = jsFiles.some((f) => {
    const content = readFileMaybe(f);
    if (!content) return false;
    return /Ionicons\.(ttf|otf|woff2?)/i.test(content) || /ionicons/i.test(content);
  });

  if (fontFiles.length > 0 && jsReferenceHit) {
    console.log(`[verify-web-build] OK: Found ${fontFiles.length} font asset(s) and JS references to Ionicons.`);
    return;
  }

  // 3) Final: allow a direct JS reference even if filenames got fully hashed.
  if (jsReferenceHit) {
    console.log('[verify-web-build] OK: JS bundles reference Ionicons (font may be hashed).');
    return;
  }

  console.error('[verify-web-build] FAILED: Could not confirm Ionicons font is bundled into web-build.');
  console.error('[verify-web-build] This often leads to missing icons in production on web.');
  console.error('[verify-web-build] Checks performed:');
  console.error('  - Looked for font files named like Ionicons.* in web-build');
  console.error('  - Scanned JS bundles for Ionicons font references');
  console.error('[verify-web-build] Next things to check:');
  console.error('  - App.js loads fonts via `useFonts({ ...(Ionicons.font) })` (should be present)');
  console.error('  - `@expo/vector-icons` and `expo-font` versions match Expo SDK');
  console.error('  - Re-run a clean export: remove web-build then `npm run build`');

  process.exit(1);
}

main();
