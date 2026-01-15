const cp = require('child_process');
const fs = require('fs');
function run(cmd){ return cp.execSync(cmd, {encoding:'utf8'}); }
try{
  const out = run('npx eslint -f json . --ext .js,.jsx,.ts,.tsx');
  const results = JSON.parse(out);
  let updates = 0;
  results.forEach(fileRes => {
    const filePath = fileRes.filePath;
    const msgs = fileRes.messages.filter(m => m.ruleId === 'no-unused-vars' && /'e' is defined but never used/.test(m.message));
    if(msgs.length===0) return;
    let src = fs.readFileSync(filePath,'utf8');
    const lines = src.split(/\r?\n/);
    msgs.forEach(m => {
      const lineIdx = m.line - 1;
      // search backwards up to 12 lines to find a catch declaration
      let found = -1;
      for(let i=lineIdx; i>=Math.max(0,lineIdx-12); i--){
        if(/\bcatch\s*\(\s*\(?e\b/.test(lines[i])){ found=i; break; }
      }
      if(found>=0){
        // replace first occurrence of catch(e or catch((e) => with _e
        lines[found] = lines[found].replace(/(catch\s*\(\s*\(?)e\b/,'$1_e');
        updates++;
      }
    });
    if(updates>0){
      fs.writeFileSync(filePath, lines.join('\n'),'utf8');
      console.log('Patched', filePath);
    }
  });
  console.log('Done. total updates:', updates);
}catch(err){ console.error('failed', err.message); process.exit(1); }
