const fs = require('fs');
const cp = require('child_process');
try {
  const files = cp.execSync('git ls-files "*.js" "*.jsx" "*.ts" "*.tsx"', { encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  files.forEach(f0 => {
    const f = (f0[0] === '"' && f0[f0.length-1] === '"') ? f0.slice(1,-1) : f0;
    try {
      let s = fs.readFileSync(f, 'utf8');
      let ns = s;
      // catch((_e) =>  or catch(_e =>  or catch((_err) =>
      ns = ns.replace(/catch\(\s*\(_[A-Za-z0-9]*\)\s*=>/g, 'catch((e) =>');
      ns = ns.replace(/catch\(\s*_[A-Za-z0-9]*\s*=>/g, 'catch(e =>');
      // also handle catch\(\s*\(\s*_[a-zA-Z0-9]+\s*,\s*([^)]+)\) =>  (unlikely but safe)
      ns = ns.replace(/catch\(\s*\(\s*_[A-Za-z0-9]+\s*,\s*([^)]+)\)\s*=>/g, 'catch(($1) =>');
      if (ns !== s) { fs.writeFileSync(f, ns, 'utf8'); console.log('Updated', f); }
    } catch (err) { console.error('ERR', f, err.message); }
  });
} catch (err) { console.error('fatal', err.message); process.exit(1); }
