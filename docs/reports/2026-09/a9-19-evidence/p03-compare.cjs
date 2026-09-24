const fs = require('fs'), os = require('os'), path = require('path');
const [oldDir, newDir] = process.argv.slice(2);
function build(root){ for(let i=0;i<6000;i++){const d=path.join(root,`pkg-${String(i%60).padStart(2,'0')}`,`mod-${i%7}`);fs.mkdirSync(d,{recursive:true});const b=Buffer.alloc(4096,97+i%26);b.write(`file-${i}`,0);fs.writeFileSync(path.join(d,`f-${i}.ts`),b);} }
async function gap(fn){let last=Date.now(),max=0;const t=setInterval(()=>{const n=Date.now();max=Math.max(max,n-last);last=n;},5);try{const r=await fn();max=Math.max(max,Date.now()-last);return {r,max};}finally{clearInterval(t);}}
async function run(dir,label){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p03-'));build(root);
  const mod=require(path.join(dir,'index.js'));const CM=require(path.join(dir,'checkpoint-manager.js')).CheckpointManager;
  const orig=CM.prototype.persistExternalBaseline;CM.prototype.persistExternalBaseline=function(){};
  const scan=await gap(()=>new mod.A9WorkspaceService(root).freezeTurnBaseline('scan'));
  CM.prototype.persistExternalBaseline=orig;
  const svc=new mod.A9WorkspaceService(root);const base=await svc.freezeTurnBaseline('t');
  fs.writeFileSync(path.join(root,'pkg-00','mod-0','f-0.ts'),'changed');fs.writeFileSync(path.join(root,'pkg-01','created.ts'),'created');fs.rmSync(path.join(root,'pkg-02','mod-2','f-2.ts'));
  const col=await gap(()=>svc.collectExternalChanges('t',base));
  const norm=(b)=>JSON.stringify({files:Object.fromEntries(Object.entries(b.files).map(([k,v])=>[k,v.sha256+':'+v.size]).sort()),skipped:b.skipped.map(s=>s.path+':'+s.reason).sort(),dirs:Object.keys(b.directories).sort()});
  const report=JSON.stringify({changes:col.r.changes.map(c=>[c.kind,c.path,c.recoverable]).sort(),unrec:(col.r.unrecoverable||[]).map(u=>JSON.stringify(u)).sort()});
  fs.rmSync(root,{recursive:true,force:true});
  console.log(`${label}: scanGap=${scan.max}ms collectGap=${col.max}ms`);
  return {baseline:norm(base),report};
}
(async()=>{const a=await run(oldDir,'old dist (before A9-19)');const b=await run(newDir,'new build (A9-19)');
console.log('baseline identical:',a.baseline===b.baseline,'| change report identical:',a.report===b.report);})();
