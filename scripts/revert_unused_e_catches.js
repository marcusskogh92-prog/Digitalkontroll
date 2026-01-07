const fs = require('fs');
const cp = require('child_process');
function listFiles(){
  return cp.execSync('git ls-files "*.js" "*.jsx" "*.ts" "*.tsx"',{encoding:'utf8'})
    .split(/\r?\n/).filter(Boolean).map(s=> (s[0]==='"' && s[s.length-1]==='"')?s.slice(1,-1):s);
}
function findMatchingBrace(src, start){
  // start points at index of '{'
  let depth = 0;
  for(let i=start;i<src.length;i++){
    if(src[i]==='{') depth++;
    else if(src[i]==='}'){
      depth--;
      if(depth===0) return i;
    }
  }
  return -1;
}
function processFile(path){
  let s = fs.readFileSync(path,'utf8');
  let changed = false;
  // regex to find catch with e param (various forms)
  const re = /catch\s*\(\s*(?:\(?\s*e\s*\)?)([^)]*)\)\s*(?:=>)?/g;
  let m;
  const edits = [];
  while((m=re.exec(s))!==null){
    const idx = m.index;
    const after = re.lastIndex;
    // determine body start
    let bodyStart = after;
    // skip spaces
    while(bodyStart < s.length && /[\s]/.test(s[bodyStart])) bodyStart++;
    if(s[bodyStart]==='='){
      // arrow function '=>' case, move past =>
      if(s.substr(bodyStart,2)==='=>' ){
        bodyStart += 2;
        while(bodyStart < s.length && /[\s]/.test(s[bodyStart])) bodyStart++;
      }
    }
    if(s[bodyStart]==='{'){
      const end = findMatchingBrace(s, bodyStart);
      if(end===-1) continue;
      const body = s.slice(bodyStart, end+1);
      if(!/\b e\b|\be\.|\be\?\.|\be\(/.test(body) && !/\be\s*[^=]/.test(body)){
        // e not used in body -> replace param 'e' with '_e'
        // replace only the first 'e' after 'catch('
        const before = s.slice(0, idx);
        const segment = s.slice(idx, after);
        const newSegment = segment.replace(/\bcatch\s*\(\s*\(?\s*e\s*\)?/,'catch(_e');
        s = before + newSegment + s.slice(after);
        changed = true;
        // move regex pointer forward to avoid infinite loop
        re.lastIndex = idx + newSegment.length + (s.length - (after));
      }
    } else {
      // expression body, check until semicolon or newline
      const endPos = s.indexOf('\n', bodyStart) === -1 ? s.length : s.indexOf('\n', bodyStart);
      const body = s.slice(bodyStart, endPos);
      if(!/\be\b|\be\.|\be\?\./.test(body)){
        const before = s.slice(0, idx);
        const segment = s.slice(idx, after);
        const newSegment = segment.replace(/\bcatch\s*\(\s*\(?\s*e\s*\)?/,'catch(_e');
        s = before + newSegment + s.slice(after);
        changed = true;
        re.lastIndex = idx + newSegment.length;
      }
    }
  }
  if(changed){ fs.writeFileSync(path, s, 'utf8'); console.log('Patched', path); }
}
try{
  const files = listFiles();
  files.forEach(processFile);
  console.log('Done');
}catch(err){ console.error(err.message); process.exit(1); }
