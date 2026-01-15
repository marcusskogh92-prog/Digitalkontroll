/* global Buffer */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
function unquoteGitPath(s){
  if(!s) return s;
  if(s[0]==='"' && s[s.length-1]==='"'){
    s = s.slice(1,-1);
  }
  // replace octal escapes like \303\244 with bytes
  const parts = s.split('\\');
  if(parts.length===1) return s;
  let bytes = [];
  for(let i=0;i<parts.length;i++){
    if(i===0){
      // leading part
      for(const ch of parts[0]) bytes.push(ch.charCodeAt(0));
    } else {
      const oct = parts[i].slice(0,3);
      if(/^[0-7]{3}$/.test(oct)){
        bytes.push(parseInt(oct,8));
        const rest = parts[i].slice(3);
        for(const ch of rest) bytes.push(ch.charCodeAt(0));
      } else {
        // not an octal escape, put back the backslash and part
        bytes.push(92); // '\'
        for(const ch of parts[i]) bytes.push(ch.charCodeAt(0));
      }
    }
  }
  return Buffer.from(bytes).toString('utf8');
}
try{
  const files = cp.execSync('git ls-files "*.js" "*.jsx" "*.ts" "*.tsx"',{encoding:'utf8'})
    .split(/\r?\n/).filter(Boolean);
  files.forEach(f0=>{
    const f = unquoteGitPath(f0);
    try{
      const s = fs.readFileSync(f,'utf8');
      const ns = s.replace(/catch\(\s*\(\)\s*=>/g,'catch((e) =>');
      if(ns!==s){ fs.writeFileSync(f,ns,'utf8'); console.log('Updated',f); }
    }catch(err){ console.error('ERR',f,err.message); }
  });
}catch(err){ console.error('fatal',err.message); process.exit(1); }
