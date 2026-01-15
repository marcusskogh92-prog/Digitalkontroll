const fs = require('fs');
const cp = require('child_process');
try {
  const out = cp.execSync('git ls-files "*.js" "*.jsx" "*.ts" "*.tsx"', { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  out.forEach((f) => {
    try {
      const s = fs.readFileSync(f, 'utf8');
      const ns = s.replace(/catch\(\s*\(\)\s*=>/g, 'catch((e) =>');
      if (ns !== s) {
        fs.writeFileSync(f, ns, 'utf8');
        console.log('Updated', f);
      }
    } catch (err) {
      console.error('ERR', f, err.message);
    }
  });
} catch (err) {
  console.error('fatal', err.message);
  process.exit(1);
}
