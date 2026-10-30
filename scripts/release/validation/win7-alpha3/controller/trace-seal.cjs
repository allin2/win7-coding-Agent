'use strict';
// R7 bounded scanner only. No product, requests, WMIC, network or process termination.
const fs=require('fs'),path=require('path'),gate=require('./rehearsal-gate.cjs'),trace=require('./trace-contract.cjs');
function seal(prep){
 const ctx=gate.inputs(prep),b=ctx.budget;
 const gateFile=path.win32.join(b.evidence_root,'gpu-entry-gate/gate-result.json');
 if(fs.existsSync(gateFile)){const g=gate.json(gateFile);if(!g.facts||g.facts.identity_complete!==true||g.facts.integrity_complete!==true||g.facts.cleanup_complete!==true||g.facts.lifecycle_complete!==true)throw Error('SEAL_GATE_LIFECYCLE_UNKNOWN');}
 const manifestRaw=fs.readFileSync(path.win32.join(b.candidate_root,'release-manifest.json'));
 if(gate.sha(manifestRaw)!==ctx.facts.builds[0].manifest_sha256)throw Error('SEAL_MANIFEST_PIN');
 const manifest=JSON.parse(manifestRaw);
 for(const n of ['a9-batch2-smoke.cjs','a9-batch2-fixtures.cjs'])if(gate.sha(fs.readFileSync(path.win32.join(b.candidate_root,'validation',n)))!==manifest.files.find(x=>x.path==='validation/'+n).sha256)throw Error('SEAL_MODULE_PIN');
 const smoke=require(path.win32.join(b.candidate_root,'validation/a9-batch2-smoke.cjs')),fixtures=require(path.win32.join(b.candidate_root,'validation/a9-batch2-fixtures.cjs'));
 const roots=[path.win32.join(b.new_remote_root,'trace'),path.win32.join(b.evidence_root,'gpu-entry-gate'),...['observed','task-readback','attempts','requests'].map(n=>path.win32.join(b.work_root,n))].filter(p=>fs.existsSync(p));
 const fixed=roots.map(root=>({root,inventory:trace.inventory(root)}));
 if(fixed.reduce((n,x)=>n+x.inventory.length,0)>4096||fixed.reduce((n,x)=>n+x.inventory.reduce((v,f)=>v+f.bytes,0),0)>201326592)throw Error('SEAL_METADATA_BOUND');
 for(const input of fixed)input.before=smoke.buildEvidenceManifest(input.root,[]);
 const scans=[];
 for(const input of fixed){const scan=smoke.scanRun(input.root,fixtures.testOnlySecret());if(scan.positive_control_detected!==true||scan.phase2_controls_detected!==true||!Array.isArray(scan.findings)||scan.findings.length)throw Error('SEAL_SCAN_NOT_PASS');const after=smoke.buildEvidenceManifest(input.root,[]);if(JSON.stringify(input.before.files)!==JSON.stringify(after.files))throw Error('SEAL_INPUT_CHANGED');scans.push({root:input.root,scan,manifest:after});}
 const result={schema_version:1,kind:'REHEARSAL4_TRACE_SEAL',run_id:b.run_id,status:'PASS',scans,metadata_roots:['observed','task-readback','attempts','requests'],trace_root:path.win32.join(b.new_remote_root,'trace'),trace_scanned_before_download:true};
 fs.writeFileSync(path.win32.join(b.evidence_root,'trace-seal.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return {ok:true,kind:result.kind,files:scans.reduce((n,s)=>n+s.manifest.files.length,0)};
}
module.exports={seal};
if(require.main===module){try{process.stdout.write(JSON.stringify(seal(process.argv[2]))+'\n');}catch(e){process.stderr.write(JSON.stringify({ok:false,error:trace.redact(e.message)})+'\n');process.exitCode=1;}}
