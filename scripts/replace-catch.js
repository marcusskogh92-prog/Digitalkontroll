const fs = require('fs').promises;
const path = require('path');
const dirs = ['Screens','components','hooks','scripts'];
const exts = ['.js','.jsx','.ts','.tsx'];

async function walk(dir){
  const entries = await fs.readdir(dir,{ withFileTypes: true }).catch((e) =>[]);
  for(const e of entries){
    const full = path.join(dir,e.name);
    if(e.isDirectory()){
      await walk(full);
      continue;
    }
    if(!exts.includes(path.extname(e.name))) continue;
    // skip node_modules
    if(full.includes('node_modules')) continue;
    let txt = await fs.readFile(full,'utf8');
    let orig = txt;
    // replace common unused catch param names
    txt = txt.replace(/catch\s*\(\s*(e)\s*\)/g, 'catch (_$1)');
    txt = txt.replace(/catch\s*\(\s*(err)\s*\)/g, 'catch (_$1)');
    txt = txt.replace(/catch\s*\(\s*(er)\s*\)/g, 'catch (_$1)');
    txt = txt.replace(/catch\s*\(\s*(e2)\s*\)/g, 'catch (_$1)');
    if(txt !== orig){
      await fs.writeFile(full, txt, 'utf8');
      console.log('Patched:', full);
    }
  }
}

(async ()=>{
  for(const d of dirs){
    try{ await walk(d); }catch (_err){ console.error('Err', d, _err?.message || _err); }
  }
  console.log('Done');
})();
