const fs = require('fs');
const cp = require('child_process');
const patterns = [
  { re: /\bcatch\s*\(\s*_([A-Za-z0-9]+)\s*\)/g, rep: 'catch(e)' },
  { re: /\bcatch\s*\(\s*\(\s*_([A-Za-z0-9]+)\s*\)\s*=>/g, rep: 'catch((e) =>' },
  { re: /\bcatch\s*\(\s*_([A-Za-z0-9]+)\s*=>/g, rep: 'catch(e =>' },
];
try{
  const files = cp.execSync('git ls-files "*.js" "*.jsx" "*.ts" "*.tsx"', { encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  files.forEach(f0 => {
    const f = (f0[0] === '"' && f0[f0.length-1] === '"') ? f0.slice(1,-1) : f0;
    try{
      let s = fs.readFileSync(f,'utf8');
      let ns = s;
      patterns.forEach(p => { ns = ns.replace(p.re, p.rep); });
      // Also fix cases where catch has no param but the body references e/err in the next 8 lines
      ns = ns.replace(/catch\(\s*\)\s*{([\s\S]{0,400}?)(?:\b(e|err)\b)/g, function(m, body){ return 'catch((e) => {' + body; });
      if(ns !== s){ fs.writeFileSync(f, ns, 'utf8'); console.log('Updated', f); }
    }catch(err){ console.error('ERR', f, err.message); }
  });
}catch(err){ console.error('fatal', err.message); process.exit(1); }
