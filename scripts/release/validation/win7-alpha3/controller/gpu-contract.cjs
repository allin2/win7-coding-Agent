'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const gate=require('./rehearsal-gate.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function classify(f){
 if(!f||f.identity_complete!==true||f.integrity_complete!==true||f.cleanup_complete!==true||f.lifecycle_complete!==true)return {status:'HALTED',reason:'IDENTITY_INTEGRITY_OR_LIFECYCLE_UNKNOWN',stop_products:true,recover:true,postflight:true,product_failure:false,consecutive_success:false};
 if(f.gpu_launch_failures>0)return {status:'FAIL',reason:'GPU_LAUNCH_FAILURE',stop_products:true,recover:true,postflight:true,product_failure:false,consecutive_success:false};
 if(f.ready!==true||f.window_loaded!==true||f.os_exit_code!==0||f.exit_code!==0||f.close_code!==0)return {status:'UNKNOWN',reason:'REQUIRED_GATE_FIELD_MISSING_OR_ABNORMAL',stop_products:true,recover:true,postflight:true,product_failure:false,consecutive_success:false};
 return {status:'PASS',reason:'MINIMAL_GUI_OBSERVED',stop_products:false,recover:true,postflight:true,product_failure:false,consecutive_success:false};
}
function captureFacts(events,chromiumText=''){
 const prefixes={stdout:[],stderr:[]},summaries=events.filter(x=>x.event==='output_summary');let complete=summaries.length===2;
 for(const row of events.filter(x=>x.event==='output_prefix')){
  const d=row.data||{};
  if(!Object.prototype.hasOwnProperty.call(prefixes,d.stream)||typeof d.prefix!=='string'||d.prefix.length>12000||!/^[A-Za-z0-9+/]*={0,2}$/.test(d.prefix)){complete=false;continue;}
  const bytes=Buffer.from(d.prefix,'base64'),expected=prefixes[d.stream].reduce((n,x)=>n+x.length,0);
  if(d.offset!==expected||expected+bytes.length>65536)complete=false;
  prefixes[d.stream].push(bytes);
 }
 for(const stream of ['stdout','stderr']){
  const matches=summaries.filter(x=>x.data&&x.data.stream===stream),bytes=prefixes[stream].reduce((n,x)=>n+x.length,0);
  if(matches.length!==1){complete=false;continue;}
  const d=matches[0].data;
  if(d.limit_exceeded!==false||d.beyond_prefix!==false||d.captured_bytes!==bytes||d.total_observed_bytes!==bytes)complete=false;
 }
 if(events.some(x=>['output_limit','capture_timeout','error','handshake_timeout'].includes(x.event)))complete=false;
 const text=chromiumText+'\n'+Buffer.concat(prefixes.stdout).toString('utf8')+'\n'+Buffer.concat(prefixes.stderr).toString('utf8');
 return {complete,launch_failures:(text.match(/\bERROR:gpu_process_host\.cc\(\d+\)\] GPU process launch failed: error_code=\d+(?=\s|$)/g)||[]).length};
}
function events(file){if(!fs.existsSync(file))return [];const raw=fs.readFileSync(file);if(raw.length>1048576)throw Error('GPU_EVENTS_BOUND');return raw.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);}
function verifyOrdinaryBinding(authority,session,machine){if(!Number.isSafeInteger(session)||session<1||(authority.rehearsal.target_session_id!==session)||typeof machine!=='string'||machine.toLowerCase()!==authority.target.machine_name.toLowerCase())throw Error('GPU_SIGNED_SESSION_MISMATCH');}
function prepare(prep,session,machine){
 const ctx=gate.inputs(prep),b=ctx.budget,plan=require('./phase-plan.cjs').fromBudget(b);
 const bytes=fs.readFileSync(path.win32.join(prep,'external/release-authority.json'));
 const a=gate.validateExecution(bytes,ctx,'FULL').authority;
 verifyOrdinaryBinding(a,session,machine);
 const ledger=gate.readLedger(b.evidence_root);
 gate.consumeDispatch(bytes,null,ctx,plan.gate,gate.json(gate.activationPaths(ctx).file),ledger,b.evidence_root,plan.beforeGate);
 const raw=fs.readFileSync(path.win32.join(b.candidate_root,'release-manifest.json'));if(sha(raw)!==ctx.facts.builds[0].manifest_sha256)throw Error('GPU_MANIFEST_HASH');
 const manifest=JSON.parse(raw);
 for(const n of ['a9-batch2-smoke.cjs','a9-batch2-fixtures.cjs']){const f=path.win32.join(b.candidate_root,'validation',n);if(sha(fs.readFileSync(f))!==manifest.files.find(x=>x.path==='validation/'+n).sha256)throw Error('GPU_MODULE_HASH');}
 const smoke=require(path.win32.join(b.candidate_root,'validation/a9-batch2-smoke.cjs'));
 // Same frozen producer. Gate app and profile are separate from driver-app/p03.
 const runtime=smoke.prepareDriverRuntime(b.candidate_root,b.evidence_root);
 const rows=[];const walk=(dir,rel='')=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('GPU_RUNTIME_REPARSE');const r=rel?rel+'/'+e.name:e.name,f=path.join(dir,e.name);if(e.isDirectory())walk(f,r);else if(e.isFile()){const source=path.win32.join(b.candidate_root,r);const bytes=fs.readFileSync(f);if(sha(bytes)!==sha(fs.readFileSync(source)))throw Error('GPU_RUNTIME_BYTE_DIFFERENCE');rows.push({path:r,bytes:bytes.length,sha256:sha(bytes)});}}};walk(path.win32.dirname(runtime.electronPath));
 if(rows.length!==83)throw Error('GPU_RUNTIME_83_CLOSURE');
 fs.writeFileSync(path.win32.join(b.evidence_root,'gpu-entry-gate/runtime-closure.json'),JSON.stringify({run_id:a.run_id,authority_sha256:sha(bytes),files:rows},null,2)+'\n',{flag:'wx'});
 return {ok:true,files:83};
}
function evaluate(prep){
 const ctx=gate.inputs(prep),b=ctx.budget,dir=path.win32.join(b.evidence_root,'gpu-entry-gate');
 const app=events(path.win32.join(dir,'app-events.jsonl')),capture=events(path.win32.join(dir,'capturer-events.jsonl'));
 const osFile=path.win32.join(dir,'gui-os-exit.json'),cleanupFile=path.win32.join(dir,'cleanup-proof.json');
 const os=fs.existsSync(osFile)?gate.json(osFile):null,cleanup=fs.existsSync(cleanupFile)?gate.json(cleanupFile):null;
 const stderr=path.win32.join(dir,'chromium.log');let text='';if(fs.existsSync(stderr)){if(fs.statSync(stderr).size>1048576)throw Error('GPU_LOG_BOUND');text=fs.readFileSync(stderr,'utf8');}
 const captured=captureFacts(capture,text),failures=captured.launch_failures;
 const last=name=>capture.find(x=>x.event===name);
 const facts={identity_complete:!!cleanup&&cleanup.identity_complete===true,integrity_complete:fs.existsSync(path.win32.join(dir,'runtime-closure.json')),cleanup_complete:!!cleanup&&cleanup.complete===true,lifecycle_complete:!!os&&!!last('exit')&&!!last('close')&&captured.complete,capture_complete:captured.complete,ready:app.some(x=>x.event==='ready'),window_loaded:app.some(x=>x.event==='did_finish_load'),gpu_launch_failures:failures,os_exit_code:os?os.exit_code:null,exit_code:last('exit')?last('exit').data.code:null,close_code:last('close')?last('close').data.code:null,gpu_job:'UNKNOWN_WHEN_NOT_OBTAINED'};
 const verdict=classify(facts),a=gate.json(path.win32.join(prep,'external/release-authority.json'));
 const result={schema_version:1,kind:'REHEARSAL4_GPU_ENTRY_GATE',run_id:b.run_id,authority_sha256:sha(fs.readFileSync(path.win32.join(prep,'external/release-authority.json'))),stage_index:require('./phase-plan.cjs').fromBudget(b).gateIndex+1,product_request_index:null,evidence_class:ctx.descriptor.evidence_class,facts,...verdict};
 fs.writeFileSync(path.win32.join(dir,'gate-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
module.exports={captureFacts,verifyOrdinaryBinding,classify,prepare,evaluate};
if(require.main===module){try{const r=process.argv[2]==='prepare'?prepare(process.argv[3],Number(process.argv[4]),process.argv[5]):evaluate(process.argv[3]);process.stdout.write(JSON.stringify(r)+'\n');if(r.status&&r.status!=='PASS')process.exitCode=1;}catch(e){process.stderr.write(JSON.stringify({ok:false,error:require('./trace-contract.cjs').redact(e.message)})+'\n');process.exitCode=1;}}
