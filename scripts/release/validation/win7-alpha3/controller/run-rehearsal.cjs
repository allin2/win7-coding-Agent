'use strict';
// Shared local controller. Authority rules are local; target commands use fixed code + stdin JSON.
const fs=require('fs'),path=require('path'),child=require('child_process');
const gate=require('./rehearsal-gate.cjs'),localEntry=require('./local-entry.cjs'),marker=require('./mark-rehearsal.cjs');
const admission=require('./admission.cjs'),runtime=require('./remote-inputs.cjs');
const runContext=require('./run-context.cjs');
const recovery=require('./recovery-download.cjs');
const TAG='FORMAL_GATE_A_EXECUTION';
const R3_UPLOAD_MS=600000;
const R5_REGISTER_MS=60000;
const R4_WALL_SECONDS=900; // Planning cap; see REHEARSAL_PLAN R4 cost model. Absolute deadline still wins.
function transportHost(ctx){const d=ctx.descriptor||gate.json(path.join(ctx.prep,'RUN_DESCRIPTOR.json'));runContext.validate(d,d.mode);need(ctx.authority.rehearsal.ssh_host===d.ssh_host,'SSH_HOST_BINDING');return 'dccs-chaizl@'+d.ssh_host;}
const SSH_OPTIONS=['-F','/dev/null','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
 '-o','UserKnownHostsFile=/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/known_hosts_win7','-o','HostKeyAlias=192.168.1.11',
 '-o','ConnectTimeout=20','-o','ConnectionAttempts=1','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=6',
 '-i','/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/id_rsa_win7accept'];
function need(ok,code){if(!ok)throw Error('RUN_REHEARSAL:'+code);}
function code(e){return /^(?:RUN_REHEARSAL|REHEARSAL_GATE|LOCAL_ENTRY|CONTROLLER_ADMISSION|EXECUTION_TOOLS|RUN_CONTEXT|TARGET_BINDING|PHASE_PLAN|REMOTE_INPUTS):[A-Za-z0-9_:.-]+$/.test(e.message)?e.message:'RUN_REHEARSAL:IO_OR_RUNTIME_FAILED';}
function locations(ctx){return runContext.paths(ctx);}
function exactFile(file,expected){need(typeof file==='string'&&!file.split(/[\\/]/).includes('..')&&path.resolve(file)===expected,'FIXED_INPUT_PATH');
 need(fs.realpathSync(file)===expected&&fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink(),'INPUT_LINK');return fs.readFileSync(file);}
function runAncestors(out,repo){for(let current=out;;current=path.dirname(current)){
 let stat;try{stat=fs.lstatSync(current);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(stat)need(stat.isDirectory()&&!stat.isSymbolicLink()&&fs.realpathSync(current)===current,'LOCAL_RUN_LINK');
 if(current===repo)break;need(current!==path.dirname(current),'LOCAL_RUN_ANCESTOR');}}
function write(file,value){fs.writeFileSync(file,Buffer.isBuffer(value)?value:gate.encode(value),{flag:'wx'});}
function safeRel(s){need(typeof s==='string'&&s.length>0&&!s.startsWith('/')&&!/[\\:\x00-\x1f]/.test(s)&&s.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[. ]$/.test(x)),'REMOTE_RELATIVE_PATH');return s;}
function quote(s){need(!/[\x00-\x1f]/.test(s),'SFTP_TEXT');return '"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';}
function lastJSON(raw){const lines=raw.toString('utf8').split(/\r?\n/).filter(x=>x.startsWith('{'));need(lines.length>0,'JSON_LINE_MISSING');return gate.parseJSON(lines[lines.length-1]);}
function adminScript(ctx) {
 const root=__dirname;
 // Only fixed source composition, never a run value or input JSON in executable text.
 const reader=fs.readFileSync(path.join(root,'admin-input.ps1'),'utf8');
 const glue=fs.readFileSync(path.join(root,'run-admin.ps1'),'utf8');
 const environment=fs.readFileSync(path.join(root,'environment-process.ps1'),'utf8');
 return Buffer.from('param([string]$AdminWireInput)\n'+reader+'\n'+glue.split('# @ENVIRONMENT_PROCESS_PS@').join(environment)+
  '\nInitialize-AdminInput $AdminWireInput\nInvoke-RehearsalAdmin -Step $AdminStep -Phase $AdminPhase -Rows $AdminRows -Owned $AdminOwned -DeletePhases $AdminDeletes\n','utf8');
}
function adminCommand(ctx) {
 // A short fixed bootstrap avoids the Windows command-line limit for the large admin source.
 // First stdin line is fixed source bytes; its expected hash depends only on source, never run data.
 const pin=gate.sha(ctx.pinnedAdminScript),sourceChars=ctx.pinnedAdminScript.toString('base64').length;
 // PowerShell owns redirected stdin. Read its text pipeline, never compete with it through Console.In.
 // Keep the existing two-line wire contract: fixed source base64, then canonical JSON data.
 const ps="$ErrorActionPreference='Stop';try{$lines=New-Object 'Collections.Generic.List[string]';"+
  "$input | ForEach-Object {[string]$line=$_;if($lines.Count -ge 2){throw 'ADMIN_WIRE_LINES'};"+
  "if(($lines.Count -eq 0 -and $line.Length -ne "+sourceChars+") -or ($lines.Count -eq 1 -and $line.Length -gt 262143)){throw 'ADMIN_WIRE_BOUND'};$lines.Add($line)};"+
  "if($lines.Count -ne 2){throw 'ADMIN_WIRE_LINES'};"+
  "if($lines[0] -cnotmatch '\\A(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\\z'){throw 'ADMIN_SOURCE_BASE64'};"+
  "$raw=[Convert]::FromBase64String($lines[0]);"+
  "$h=[Security.Cryptography.SHA256]::Create();try{$actual=[BitConverter]::ToString($h.ComputeHash($raw)).Replace('-','').ToLowerInvariant()}finally{$h.Clear()};"+
  "if($actual -cne '"+pin+"'){throw 'ADMIN_SOURCE_HASH'};$utf8=New-Object Text.UTF8Encoding($false,$true);"+
  '& ([ScriptBlock]::Create($utf8.GetString($raw))) ($lines[1]+"`n")'+
  "}catch{$code=[string]$_.Exception.Message;if($code -cnotmatch '^ADMIN_[A-Z0-9_]+$'){$code='ADMIN_BOOTSTRAP_FAILED'};"+
  "[Console]::Out.WriteLine(('{\"ok\":false,\"error\":\"'+$code+'\"}'));exit 1}";
 return 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -InputFormat Text -OutputFormat Text -EncodedCommand '+Buffer.from(ps,'utf16le').toString('base64');
}
function adminBody(ctx,step,phase='',rows='',owned=false,deletes=[]) {
 need(['R1','R2','R3','R3-state','R4','R5','R6','R7','R8'].includes(step),'ADMIN_STEP');
 need(!phase||ctx.budget.p1.dispatch_stages.includes(phase),'PHASE');
 need(deletes.every(p=>ctx.budget.p1.dispatch_stages.includes(p)),'DELETE_PHASE');
 const b=ctx.budget,p=require('./phase-plan.cjs').fromBudget(b);
 need(/^[A-Za-z0-9_-]{1,64}$/.test(ctx.lockHolder||''),'LOCK_HOLDER');
 need(/^[A-Za-z0-9_-]{1,64}$/.test(b.target_machine)&&/^S-1-5-21-[0-9-]+$/.test(b.target_sid),'ADMIN_IDENTITY');
 return Buffer.from(JSON.stringify({schema_version:1,step,phase,run_id:ctx.descriptor.run_id,
  session_id:b.p1.target_session_id,machine_name:b.target_machine,account_sid:b.target_sid,
  lock_holder:ctx.lockHolder,expires_at_utc:ctx.window.expires_at_utc,
  phase_seconds:p.dispatch.map(n=>p.seconds[n]),rows_base64:Buffer.from(rows).toString('base64'),
  owned,delete_phases:deletes.join(',')})+'\n','utf8');
}
function r2Body(_prep,ctx) { return adminBody(ctx,'R2'); }
function makeTransport(ctx,out,now,spawn){
 need(typeof spawn==='function','INJECTED_EXECUTOR_REQUIRED');
 const HOST=transportHost(ctx),a=ctx.authority,counts={ssh:0,upload:0,download:0,sftp:0};
 const limits={ssh:a.rehearsal.execution_ssh_sessions,upload:a.rehearsal.sftp_upload_sessions,download:a.rehearsal.sftp_download_sessions};
 need(limits.ssh===ctx.budget.p1.execution_ssh_sessions&&limits.upload===3&&limits.download===3,'TRANSPORT_LIMITS');
 const ledger=path.join(out,'TRANSPORT_LEDGER.tsv');
 const rows=[];const actualPreflights=0;
 write(ledger,Buffer.from(rows.map(x=>x.join('\t')).join('\n')+'\n'));
 let serial=0;
 function exec(step,kind,input,maxMs,cleanup=false){
  need(/^(R[1-8])(?:-[a-zA-Z0-9-]+)?$/.test(step),'TRANSPORT_STEP');need(['ssh','upload','download'].includes(kind),'TRANSPORT_KIND');
  const until=Math.min(ctx.deadline,ctx.ownerEnd),remaining=until-now();need(remaining>0,'TRANSPORT_DEADLINE');
  need(counts[kind]<limits[kind],'TRANSPORT_BUDGET_'+kind);
  counts[kind]++;if(kind!=='ssh')counts.sftp++;
  const category=kind==='ssh'?'ssh':'sftp',sequence=category==='ssh'?counts.ssh+actualPreflights:counts[kind];
  const wireInput=kind==='ssh'?Buffer.concat([Buffer.from(ctx.pinnedAdminScript.toString('base64')+'\n'),input]):input;
  const prefix=String(++serial).padStart(3,'0')+'-'+step,body=path.join(out,prefix+'.stdin');write(body,wireInput);
  const command=category==='ssh'?'/usr/bin/ssh':'/usr/bin/sftp';
  const argv=category==='ssh'?[...SSH_OPTIONS,HOST,adminCommand(ctx)]:[...SSH_OPTIONS,'-q','-b','-',HOST];
  const timeout=Math.max(1,Math.floor(Math.min(maxMs,remaining))),started=new Date(now()).toISOString();
  write(path.join(out,prefix+'.command.json'),{evidence_class:ctx.mode==='DEV_CHANNEL'?'DEV_CHANNEL':TAG,formal_gate_a:false,formal_gate_b:false,command,argv,step,category,sequence,attempt:kind==='ssh'?1:sequence,resumed:kind!=='ssh'&&sequence>1,timeout_ms:timeout,stdin_sha256:gate.sha(wireInput),started_utc:started});
  fs.appendFileSync(ledger,[started,step,kind,sequence,'STARTED'].join('\t')+'\n','utf8');
  let result;
  try{result=spawn(command,argv,{cwd:locations(ctx).repo,input:wireInput,timeout,maxBuffer:8*1024*1024,encoding:null});}
  catch(_){result={status:null,error:true,stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)};}
  const stdout=Buffer.from(result.stdout||''),stderr=Buffer.from(result.stderr||'');
  write(path.join(out,prefix+'.stdout.raw'),stdout);write(path.join(out,prefix+'.stderr.raw'),stderr);
  const exit=Number.isSafeInteger(result.status)?result.status:'UNKNOWN';
  fs.appendFileSync(ledger,[new Date(now()).toISOString(),step,kind,sequence,exit].join('\t')+'\n','utf8');
  write(path.join(out,prefix+'.result.json'),{evidence_class:ctx.mode==='DEV_CHANNEL'?'DEV_CHANNEL':TAG,formal_gate_a:false,formal_gate_b:false,attempt:kind==='ssh'?1:sequence,exit_code:exit,error:!!result.error,signal:result.signal||null});
  if(result.error||result.status!==0){const e=Error('RUN_REHEARSAL:TRANSPORT_'+step+'_FAILED');e.transport={kind,status:result.status,error:!!result.error,signal:result.signal||null,stdout,stderr};throw e;}return stdout;
 }
 return {exec,counts,limits};
}
function sftpBatch(ctx,out,transport,kind,inventory,now,validateInputs=()=>{},raw=null){
 need(['upload','download'].includes(kind),'SFTP_BATCH_KIND');
 const initial=recovery.transferPlan(inventory);let pending=inventory.slice(),progress=null;
 for(let attempt=1;attempt<=3;attempt++){
  validateInputs();const localEnd=Math.min(now()+120000,ctx.deadline-120000,ctx.ownerEnd-120000);
  if(kind==='upload')for(const row of inventory){
   need(now()<localEnd,'RESUME_PROGRESS_DEADLINE');const st=fs.lstatSync(row.local);
   need(st.isFile()&&!st.isSymbolicLink()&&fs.realpathSync(row.local)===row.local,'RESUME_LOCAL_INPUT_CHANGED');
   const body=fs.readFileSync(row.local);need(body.length===row.bytes&&gate.sha(body)===row.sha256,'RESUME_LOCAL_INPUT_CHANGED');
  }
  else if(attempt>1){progress=recovery.downloadRemainder(raw,inventory,now,localEnd);pending=progress.pending;recovery.verifyProgressPins(progress.pins);}
  need(now()<localEnd,'RESUME_PROGRESS_DEADLINE');
  if(kind==='upload'&&attempt>1&&pending.length){
   const queryEnd=Math.min(now()+120000,ctx.deadline-120000,ctx.ownerEnd-120000);need(queryEnd>now(),'UPLOAD_QUERY_DEADLINE');
   const queryRows=pending.map(row=>row.remote).join('\n')+'\n';
   const state=lastJSON(transport.exec('R3-state-'+attempt,'ssh',adminBody(ctx,'R3-state','',queryRows),queryEnd-now()));
   write(path.join(out,'upload-attempt-'+attempt+'.remote-state.json'),state);
   pending=recovery.uploadState(pending,state,ctx.budget);
  }
  const remaining=pending.map(row=>({bytes:attempt>1?row.remaining_bytes:row.bytes}));
  const uploadPlan=recovery.transferPlan(remaining),window=recovery.downloadWindow(ctx,now(),remaining);
  const verbs=pending.map(row=>attempt===1?(kind==='upload'?'put':'get'):(row.transfer_verb||(kind==='upload'?'put':'get')));
  const verb=new Set(verbs).size===1?verbs[0]:'MIXED';
  const commands=pending.map((row,index)=>verbs[index]+' '+(kind==='upload'?quote(row.local)+' '+quote(row.remote.replace(/\\/g,'/')):quote(row.remote.replace(/\\/g,'/'))+' '+quote(row.local)));
  const batch=commands.join('\n')+'\n';
  write(path.join(out,kind+'-attempt-'+attempt+'.plan.json'),{attempt,kind,verb,transfers:pending.map((row,index)=>({path:row.remote,verb:verbs[index],state:kind==='upload'?(row.upload_state||'NOT_STARTED'):(row.download_state||'NOT_STARTED')})),original_bytes:initial.bytes,original_files:initial.files,remaining_bytes:uploadPlan.bytes,remaining_files:uploadPlan.files,remote_partial_offset:kind==='upload'&&attempt>1?'REMOTE_STATE_LENGTH_RECORDED':null,timeout_seconds:kind==='upload'?uploadPlan.seconds:window.timeout_ms/1000,paths:pending.map(row=>row.remote)});
  if(!pending.length)return {attempts:attempt-1,complete_locally:true};
  need(kind==='upload'||window.status==='READY','RECOVERY_DOWNLOAD_NOT_PERFORMED');
  try{
   if(kind==='upload')transport.exec('R3-upload','upload',Buffer.from(batch),uploadPlan.seconds*1000);
   else transport.exec('R7-download','download',Buffer.from(batch),window.timeout_ms,true);
   return {attempts:attempt};
  }catch(error){
   const retry=attempt<3&&recovery.transportDisconnect(error.transport);
   write(path.join(out,kind+'-attempt-'+attempt+'.decision.json'),{attempt,eligible_transport_disconnect:recovery.transportDisconnect(error.transport),resume:retry,stage_retry:false});
   if(!retry)throw error;
   if(kind==='upload')pending=recovery.uploadRemainder(pending,commands,error.transport.stdout);
  }
 }
}
function verifyStock(ctx) {
 const where=locations(ctx),build=ctx.facts.builds[0],rows=[];
 function add(local,remote,expected) {
  local=path.resolve(local);const raw=runtime.regular(local,where.repo);
  need(gate.sha(raw)===expected,'STOCK_HASH');rows.push({local,remote,bytes:raw.length,sha256:expected});
 }
 const zip=path.resolve(where.repo,build.zip);
 need(Number.isSafeInteger(build.bytes)&&fs.statSync(zip).size===build.bytes,'ZIP_BYTES');
 add(zip,path.win32.join(ctx.budget.work_root,'package','candidate.zip'),build.sha256);
 add(path.join(ctx.prep,'external/a9-batch2-input-lock.json'),path.win32.join(ctx.budget.tools_root,'external/a9-batch2-input-lock.json'),ctx.facts.formal_input_lock_sha256);
 add(path.join(ctx.prep,'external/a9-v26-approved-build-kits.json'),path.win32.join(ctx.budget.tools_root,'external/a9-v26-approved-build-kits.json'),ctx.facts.approval_registry.sha256);
 add(path.join(ctx.prep,'ZIP_ENTRIES.tsv'),path.win32.join(ctx.budget.tools_root,'ZIP_ENTRIES.tsv'),build.zip_entries_sha256);
 return rows;
}
function finalInventory(ctx,stock,where,prepared) {
 const remote=ctx.budget.tools_root,folder=path.join(where.out,'remote-inputs');fs.mkdirSync(folder);
 const generated=prepared.files,rows=stock.map(x=>({...x}));
 runtime.validateBinding(prepared.runtime_inputs,ctx,ctx.executionTools);
 for(const [name,raw] of Object.entries({...generated,
  'external/RUNTIME_INPUTS.json':gate.encode(prepared.runtime_inputs),
  'external/release-authority.json':ctx.executionBindingBytes})) {
  runtime.safeName(name);const file=path.join(folder,name);fs.mkdirSync(path.dirname(file),{recursive:true});write(file,raw);
  rows.push({local:file,remote:path.win32.join(remote,name),bytes:raw.length,sha256:gate.sha(raw)});
 }
 for(const name of ['activation.json','activation-anchor.json']) {
  const file=path.join(gate.activationPaths(ctx).root,name),raw=fs.readFileSync(file);
  rows.push({local:file,remote:path.win32.join(remote,'activation-evidence',name),bytes:raw.length,sha256:gate.sha(raw)});
 }
 const sums=path.join(where.out,'SHA256SUMS.remote');
 write(sums,Buffer.from(rows.filter(x=>x.remote.startsWith(remote+'\\')).map(x=>x.sha256+'  '+path.win32.relative(remote,x.remote).replace(/\\/g,'/')).sort().join('\n')+'\n'));
 rows.push({local:sums,remote:path.win32.join(remote,'SHA256SUMS'),bytes:fs.statSync(sums).size,sha256:gate.sha(fs.readFileSync(sums))});
 need(new Set(rows.map(x=>x.remote.toLowerCase())).size===rows.length,'FINAL_TRANSFER_DUPLICATE');
 write(path.join(where.out,'TRANSFER_MANIFEST.final.json'),{schema_version:1,run_id:ctx.descriptor.run_id,evidence_class:ctx.mode,items:rows});return rows;
}
function verifyTransfer(raw,rows){const lines=raw.toString('utf8').trimEnd().split(/\r?\n/);need(lines.length===rows.length,'TRANSFER_READBACK_COUNT');
 const actual=new Map();for(const line of lines){const v=line.split('\t');need(v.length===3&&!actual.has(v[2]),'TRANSFER_READBACK_ROW');actual.set(v[2],v);}
 for(const row of rows){const v=actual.get(row.remote);need(v&&v[0]===row.sha256&&Number(v[1])===row.bytes,'TRANSFER_READBACK_HASH');}}
function snapshot(raw,ctx,index,out){const value=lastJSON(raw),phase=ctx.authority.rehearsal.phases[index];
 need(value.ok===true&&value.kind==='PHASE_SNAPSHOT'&&value.phase===phase&&Array.isArray(value.directories)&&Array.isArray(value.results),'PHASE_SNAPSHOT');
 const expected=ctx.authority.rehearsal.phases.slice(0,index+1).map((p,i)=>String(i+1).padStart(2,'0')+'-'+p);
 need(JSON.stringify([...value.directories].sort())===JSON.stringify([...expected].sort())&&value.results.length===expected.length,'PHASE_DIRECTORIES');
 const folder=path.join(out,'snapshot-'+String(index+1));fs.mkdirSync(folder);fs.mkdirSync(path.join(folder,'requests'));
 const b64=s=>{need(typeof s==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s),'BASE64');return Buffer.from(s,'base64');};
 write(path.join(folder,'request-ledger.jsonl'),b64(value.ledger_base64));const seen=new Set();
 for(const item of value.results){need(expected.includes(item.directory)&&!seen.has(item.directory),'PHASE_RESULT_DIRECTORY');seen.add(item.directory);
  const dir=path.join(folder,'requests',item.directory);fs.mkdirSync(dir);write(path.join(dir,'phase-result.json'),b64(item.base64));}
 const ledger=gate.readLedger(folder);gate.verifyLedgerFiles(ledger,folder,ctx.authority);need(ledger.length===(index+1)*2,'PHASE_LEDGER_COUNT');return {root:folder,ledger};
}
function metadataWorkSizes(metadata){
 const fields=['reason','detail','tree_detail','retained_file_hashes','raw_evidence_retained_on_target','downloaded_content','work_file_sizes','work_file_sizes_truncated','work_file_sizes_detail'];
 need(metadata&&typeof metadata==='object'&&!Array.isArray(metadata)&&Object.keys(metadata).length===fields.length&&fields.every(k=>Object.prototype.hasOwnProperty.call(metadata,k)),'RECOVERY_METADATA_FIELDS');
 need(typeof metadata.reason==='string'&&metadata.reason.length>0&&[metadata.detail,metadata.tree_detail,metadata.work_file_sizes_detail].every(x=>x===null||(typeof x==='string'&&x.length<=300&&!/[\x00-\x1f]/.test(x)))
  &&Array.isArray(metadata.retained_file_hashes)&&metadata.retained_file_hashes.every(x=>typeof x==='string')&&metadata.raw_evidence_retained_on_target===true&&metadata.downloaded_content===false,'RECOVERY_METADATA_VALUES');
 need(Array.isArray(metadata.work_file_sizes)&&metadata.work_file_sizes.length<=256&&typeof metadata.work_file_sizes_truncated==='boolean','RECOVERY_WORK_SIZES');
 const seen=new Set(),items=metadata.work_file_sizes.map(item=>{
  need(item&&typeof item==='object'&&!Array.isArray(item),'RECOVERY_WORK_ITEM');const name=safeRel(item.path);
  need((name==='w'||name.startsWith('w/'))&&!seen.has(name.toLowerCase()),'RECOVERY_WORK_PATH');seen.add(name.toLowerCase());
  if(item.reparse===true){need(Object.keys(item).sort().join(',')==='path,reparse','RECOVERY_WORK_REPARSE');return {path:name,reparse:true};}
  need(Object.keys(item).sort().join(',')==='last_write_utc,length,path'&&name!=='w'&&Number.isSafeInteger(item.length)&&item.length>=0
   &&typeof item.last_write_utc==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item.last_write_utc)&&Number.isFinite(Date.parse(item.last_write_utc))
   &&new Date(item.last_write_utc).toISOString()===item.last_write_utc,'RECOVERY_WORK_FILE');return {path:name,length:item.length,last_write_utc:item.last_write_utc};
 }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 return {...metadata,work_file_sizes:items};
}
function recoveryPlan(raw,ctx,attempted,failedPhase=null){const v=lastJSON(raw);need(v.ok===true&&v.kind==='RECOVERY'&&Array.isArray(v.tree)&&Array.isArray(v.scans),'RECOVERY_JSON');
 if(v.owned===false)return {items:[],reason:'NO_OWNED_ROOT'};need(v.owned===true,'RECOVERY_OWNERSHIP');
 if(v.metadata_only===true){need(v.tree.length===0&&v.scans.length===0,'RECOVERY_METADATA_NO_CONTENT');return {items:[],reason:'METADATA_ONLY_SCAN_OR_WRITER_GATE_FAILED',metadata:metadataWorkSizes(v.metadata),first_failure_preserved:true,raw_evidence_retained_on_target:true};}
 const all=new Map();for(const line of v.tree){need(typeof line==='string','TREE_LINE');const x=line.split('\t');need(x.length===3&&/^[a-f0-9]{64}$/.test(x[0])&&/^\d+$/.test(x[1]),'TREE_ROW');
  const name=safeRel(x[2]);need(!all.has(name),'TREE_DUPLICATE');all.set(name,{path:name,sha256:x[0],bytes:Number(x[1])});}
 const sealBytes=Buffer.from(v.trace_seal_base64||'','base64'),seal=gate.parseJSON(sealBytes);
 const sealFact=all.get('e/trace-seal.json');
 need(sealFact&&sealFact.sha256===gate.sha(sealBytes)&&seal.run_id===ctx.budget.run_id&&seal.status==='PASS'&&seal.trace_scanned_before_download===true,'TRACE_SEAL_REQUIRED');
 const scans=new Map();for(const row of v.scans){need(ctx.budget.p1.phases.includes(row.phase)&&!scans.has(row.phase),'SCAN_PHASE');
  const bytes=Buffer.from(row.base64,'base64'),fact=all.get('e/rehearsal-postflight/'+row.phase+'.json');need(fact&&fact.sha256===gate.sha(bytes)&&fact.bytes===bytes.length,'SCAN_HASH');scans.set(row.phase,gate.parseJSON(bytes));}
 for(const ph of attempted){const s=scans.get(ph);need(s&&s.phase===ph&&s.evidence_class===(ctx.mode==='DEV_CHANNEL'?'DEV_CHANNEL':TAG)&&s.listing_failed===false&&Array.isArray(s.residue)&&!s.residue.length,'RECOVERY_SCAN_REQUIRED');
  for(const name of ['scan','log_scan','data_scan'])need(s[name]&&s[name].positive_control_detected===true&&s[name].phase2_controls_detected===true&&Array.isArray(s[name].findings)&&s[name].findings.length===0,'RECOVERY_SCAN_NOT_PASS');}
 const excludedReason=x=>/\.tmp-[0-9]+$/.test(x.path)?'NOT_DOWNLOADED_ATOMIC_TEMP':ctx.budget.p1.phases.some(ph=>['stdout','stderr'].some(stream=>x.path==='w/logs/'+ph+'-finish-'+stream+'.txt'))?'NOT_DOWNLOADED_FINISH_SELF_LOG':/(?:^|\/)(?:vault|credentials)(?:[/.]|$)/i.test(x.path)?'NOT_DOWNLOADED_VAULT_OR_CREDENTIAL_FILE':/^d\/tmp\//.test(x.path)?'NOT_DOWNLOADED_RUNTIME_TEMPORARY':null;
 const forbidden=x=>!!excludedReason(x);
 const excluded=[...all.values()].filter(forbidden).map(x=>({...x,status:excludedReason(x)}));
 let selected=[...all.values()].filter(x=>!forbidden(x)&&(/^(trace\/|e\/|d\/|w\/(?:logs|observed|task-readback|attempts|requests)\/)/.test(x.path)));
 const coverage=new Map();
 function cover(prefix,manifest){need(manifest&&Array.isArray(manifest.files),'RECOVERY_MANIFEST');for(const file of manifest.files){const name=prefix+safeRel(file.path);need(/^[a-f0-9]{64}$/.test(file.sha256||'')&&Number.isSafeInteger(file.size)&&file.size>=0,'RECOVERY_MANIFEST_ROW');coverage.set(name,file);}}
 for(const ph of attempted){const s=scans.get(ph);cover('e/',s.manifest);cover('w/logs/',s.log_manifest);cover('d/',s.data_manifest);}
 for(const area of seal.scans||[]){
  const root=String(area.root||'').toLowerCase();let prefix=null;
  if(root===path.win32.join(ctx.budget.new_remote_root,'trace').toLowerCase())prefix='trace/';
  if(root===path.win32.join(ctx.budget.evidence_root,'gpu-entry-gate').toLowerCase())prefix='e/gpu-entry-gate/';
  for(const name of ['observed','task-readback','attempts','requests'])if(root===path.win32.join(ctx.budget.work_root,name).toLowerCase())prefix='w/'+name+'/';
  need(prefix!==null,'SEAL_SCOPE_NOT_APPROVED');
  need(area.scan&&area.scan.positive_control_detected===true&&area.scan.phase2_controls_detected===true&&Array.isArray(area.scan.findings)&&area.scan.findings.length===0,'TRACE_SEAL_SCAN');cover(prefix,area.manifest);
 }
 const generated=new Set(['e/trace-seal.json',...[...scans.keys()].map(ph=>'e/rehearsal-postflight/'+ph+'.json')]);
 for(const item of selected.filter(x=>x.path.startsWith('trace/'))){const proof=coverage.get(item.path);need(proof&&proof.sha256===item.sha256&&proof.size===item.bytes,'TRACE_TREEHASH_MISMATCH');}
 selected=selected.filter(item=>{
  if(generated.has(item.path))return true;
  const proof=coverage.get(item.path);
  if(!proof){excluded.push({...item,status:item.path.startsWith('w/logs/gpu-entry-gate-')?'NOT_DOWNLOADED_GATE_LOG_NO_APPROVED_SCAN':'NOT_DOWNLOADED_NO_APPROVED_SCAN'});return false;}
  if(proof.sha256!==item.sha256||proof.size!==item.bytes){excluded.push({...item,status:'NOT_DOWNLOADED_MANIFEST_CHANGED'});return false;}return true;
 });
 const bytes=selected.reduce((n,x)=>n+x.bytes,0);need(selected.length<=ctx.budget.p1.download_max_files&&bytes<=ctx.budget.p1.download_max_bytes,'RECOVERY_BUDGET');
 for(const item of selected)need(Number.isSafeInteger(item.bytes)&&item.bytes>=0&&!/(?:^|\/)(?:vault|credentials)(?:[/.]|$)/i.test(item.path),'RECOVERY_FORBIDDEN_FILE');
 const ordered=recovery.selectApproved(selected,excluded,ctx,failedPhase);
 return {...ordered,reason:ordered.items.length?'RECOVER':'NO_FILES'};
}
function run(args,deps={}) {
 return runMigration(args,deps);
}
// Both programmatic and CLI paths use this body. Only the explicit CLI branch supplies real spawn.
function runMigration(args,deps={}) {
 need(typeof deps.spawn==='function','INJECTED_EXECUTOR_REQUIRED');
 const ctx={...(deps.ctx||runContext.load(args.descriptor))},now=deps.now||Date.now;
 ctx.repo=deps.repo||ctx.repo||path.resolve(__dirname,'../../../../..');ctx.inputRoot=ctx.prep;
 const settings=deps.authorization||localEntry.loadOptions(args.authorization);
 need(settings.mode===undefined||settings.mode===ctx.mode,'AUTHORIZATION_CLASS');
 need(settings.runId===undefined||settings.runId===ctx.descriptor.run_id,'AUTHORIZATION_RUN');
 ctx.lockHolder=settings.lockHolder;
 const where=locations(ctx),bytes=exactFile(where.authority,where.authority);
 need(settings.executionBindingPath===undefined||path.resolve(settings.executionBindingPath)===where.authority,'AUTHORIZATION_BINDING_PATH');
 const prepared=localEntry.prepare(ctx,{...settings,mode:ctx.mode,runId:ctx.descriptor.run_id,executionBindingBytes:bytes,now:now()});
 ctx.executionBindingBytes=bytes;ctx.executionBindingSha256=prepared.execution_binding_sha256;
 ctx.executionTools=prepared.runtime_inputs.source_tools;ctx.pin=prepared.execution_binding_sha256;
 ctx.executionStartedAt=now();ctx.authority={...gate.parseJSON(bytes),rehearsal:ctx.budget.p1,execution_tools:ctx.executionTools};
 const a=ctx.authority,receipt=null,v=gate.validateExecution(bytes,ctx,'FULL',now());
 ctx.ownerEnd=v.end;ctx.deadline=Math.min(v.end,v.confirmed+(a.rehearsal.r1_start_max_seconds+a.rehearsal.max_total_seconds)*1000);
 ctx.localRunRoot=where.out;ctx.pinnedAdminScript=adminScript(ctx);
 const stock=verifyStock(ctx,a);need(!fs.existsSync(where.out),'RUN_EVIDENCE_EXISTS');
 runAncestors(where.out,where.repo);fs.mkdirSync(path.dirname(where.out),{recursive:true});fs.mkdirSync(where.out);
 write(path.join(where.out,'RUN_DESCRIPTOR.json'),ctx.descriptor);
 write(path.join(where.out,'LOCAL_AUTHORITY_RESULT.json'),{...prepared.authority,execution_inputs:prepared.execution_inputs});
 const trace=path.join(where.out,'STEP_TRACE.jsonl');write(trace,Buffer.alloc(0));
 const transport=makeTransport(ctx,where.out,now,deps.spawn),submitted=[],registered=[],attempted=[];
 let first=null,activation=null,owned=false,parentState=null,prior={root:path.join(where.out,'empty-ledger'),ledger:[]};fs.mkdirSync(prior.root);
 const failures=[];
 function failure(step,error){const item={evidence_class:ctx.mode==='DEV_CHANNEL'?'DEV_CHANNEL':TAG,formal_gate_a:false,formal_gate_b:false,step,error:code(error),detail:require('./trace-contract.cjs').exceptionDetail(error),at_utc:new Date(now()).toISOString()};failures.push(item);if(!first){first=item;write(path.join(where.out,'FIRST_FAILURE.json'),item);}}
 function stableInputs(){require('./execution-tools.cjs').verify(prepared.input_bytes.manifest,ctx);
  need(gate.sha(fs.readFileSync(where.authority))===ctx.pin,'BINDING_INPUT_CHANGED');
  need(gate.sha(gate.encode(runtime.sourcePins()))===gate.sha(gate.encode(ctx.executionTools))&&adminScript(ctx).equals(ctx.pinnedAdminScript),'MATERIAL_CHANGED');
  for(const [name,raw] of Object.entries(prepared.files))need(fs.readFileSync(path.join(ctx.prep,name)).equals(raw),'RUN_DATA_CHANGED');}
 function step(name,fn,cleanup=false){fs.appendFileSync(trace,JSON.stringify({step:name,state:'STARTED',utc:new Date(now()).toISOString()})+'\n');
  try{if(!cleanup){need(now()<ctx.deadline,'COMMON_DEADLINE');stableInputs();}
   const value=fn();fs.appendFileSync(trace,JSON.stringify({step:name,state:'PASS',utc:new Date(now()).toISOString()})+'\n');return value;}
  catch(e){failure(name,e);fs.appendFileSync(trace,JSON.stringify({step:name,state:'FAIL',error:code(e),utc:new Date(now()).toISOString()})+'\n');throw e;}}
 const ssh=(name,op,phase='',rows='',cleanup=false)=>transport.exec(name,'ssh',adminBody(ctx,op,phase,rows,owned,registered),op==='R5'?R5_REGISTER_MS:op==='R6'?((phase==='gpu-entry-gate'?120:a.rehearsal.phase_ceiling_seconds[phase])+60)*1000:op==='R4'?R4_WALL_SECONDS*1000:120000,cleanup);
 try{
  step('R0',()=>{const zip=path.resolve(where.repo,ctx.facts.builds[0].zip);const frozen=(deps.extractFrozen||gate.extractFrozen)(zip,path.join(where.out,'extracted'),ctx);
   activation=gate.activate(bytes,receipt,ctx,'FULL',frozen,zip,now());write(path.join(where.out,'R0.json'),gate.encode(activation));});
  step('R1',()=>{
   const value=lastJSON(ssh('R1','R1'));
   need(value.ok===true&&value.kind==='R1_READ_ONLY'&&value.target_ip===ctx.descriptor.ssh_host&&value.build==='7601'&&value.sp1_x64===true,'R1_RESULT');
   admission.admit(ctx,value);parentState=value;
   const sizes=fs.readFileSync(path.join(ctx.prep,'ZIP_ENTRIES.tsv'),'utf8').trimEnd().split('\n').reduce((n,row)=>n+Number(row.split('\t')[1]),0);
   const reserve=Math.max(2*1024**3,ctx.facts.builds[0].bytes+sizes+a.rehearsal.download_max_bytes);
   need(Number.isSafeInteger(sizes)&&sizes>=0&&Number.isSafeInteger(value.free_bytes)&&Number.isSafeInteger(value.channel_used_bytes)&&value.channel_used_bytes>=0&&value.channel_used_bytes+reserve<=20000000000&&value.free_bytes-reserve>=50000000000,'R1_CAPACITY');
   need(Number.isFinite(Date.parse(value.target_utc))&&Math.ceil(Math.abs(now()-Date.parse(value.target_utc))/1000)<=60,'R1_CLOCK');write(path.join(where.out,'R1.json'),value);
  });
  step('R2',()=>{
   // An interrupted/failed R2 may already hold our token or have created part of the root.
   // Cleanup asserts that token remotely before touching tasks or releasing the lock.
   owned=true;
   const value=lastJSON(ssh('R2','R2'));need(value.ok===true&&value.step==='R2','R2_RESULT');
   const parents=value.created_parent_directories,allowed=['C:\\A9-DEV','C:\\A9-DEV\\run'];
   need(Array.isArray(parents)&&new Set(parents).size===parents.length&&parents.every(x=>allowed.includes(x)),'R2_PARENT_RECORD');
   need(!parents.includes(allowed[0])||parentState.channel_parent_exists===false,'R2_EXISTING_PARENT');
   need(!parents.includes(allowed[1])||parentState.run_parent_exists===false,'R2_EXISTING_PARENT');write(path.join(where.out,'R2.json'),value);
  });
  let inventory;
  step('R3-upload',()=>{inventory=finalInventory(ctx,stock,where,prepared);const uploadPlan=recovery.transferPlan(inventory);need(uploadPlan.bytes<=ctx.budget.transfer_planning.upload_max_bytes&&uploadPlan.files<=ctx.budget.transfer_planning.upload_max_files,'UPLOAD_PLAN_EXCEEDS_BUDGET');write(path.join(where.out,'UPLOAD_PLAN.json'),uploadPlan);sftpBatch(ctx,where.out,transport,'upload',inventory,now,stableInputs);});
  step('R3-verify',()=>verifyTransfer(ssh('R3-verify','R3','',inventory.map(x=>[x.sha256,x.bytes,x.remote].join('\t')).join('\n')+'\n'),inventory));
  step('R4',()=>{need(now()+(R4_WALL_SECONDS+a.rehearsal.cleanup_reserve_seconds)*1000<=ctx.deadline,'R4_INSUFFICIENT_COMMON_TIME');const value=lastJSON(ssh('R4','R4'));need(value.ok===true&&value.step==='R4','R4_RESULT');});
  for(let i=0;i<a.rehearsal.dispatch_stages.length;i++){
   const phase=a.rehearsal.dispatch_stages[i];
   step('consume-'+phase,()=>{const value=gate.consumeDispatch(bytes,receipt,ctx,phase,activation,prior.ledger,prior.root,submitted,now());write(path.join(where.out,'consume-'+phase+'.json'),value);});
   step('R5-'+phase,()=>{registered.push(phase);const value=lastJSON(ssh('R5-'+phase,'R5',phase));need(value.ok===true&&value.step==='R5','REGISTER_RESULT');});
   step('R6-'+phase,()=>{if(phase!=='gpu-entry-gate')attempted.push(phase);const raw=ssh('R6-'+phase,'R6',phase);
    if(phase==='gpu-entry-gate'){
      const v=lastJSON(raw);need(v.ok===true&&v.kind==='GATE_SNAPSHOT','GATE_SNAPSHOT');
      const data=Buffer.from(v.base64,'base64'),result=gate.parseJSON(data);
      const dir=path.join(prior.root,'gpu-entry-gate');fs.mkdirSync(dir);write(path.join(dir,'gate-result.json'),data);
      write(path.join(where.out,'GPU_GATE_RESULT.json'),data);
      need(result.run_id===a.run_id&&result.authority_sha256===ctx.pin,'GATE_BINDING');
      need(result.status==='PASS'&&require('./gpu-contract.cjs').classify(result.facts).status==='PASS','GPU_GATE_STOPS_PRODUCTS');
    }else{
      const previous=prior;prior=snapshot(raw,ctx,a.rehearsal.phases.indexOf(phase),where.out);
      const gateFile=path.join(previous.root,'gpu-entry-gate/gate-result.json');
      if(fs.existsSync(gateFile)){const dest=path.join(prior.root,'gpu-entry-gate');fs.mkdirSync(dest);write(path.join(dest,'gate-result.json'),fs.readFileSync(gateFile));}
    }
    submitted.push(phase);});
  }
 }catch(e){if(!first)failure('CONTROLLER',e);/* every cleanup step below remains independent */}
 finally{
  try{step('R7',()=>{
   if(!activation){write(path.join(where.out,'R7.json'),{status:'NOT_PERFORMED_NO_ACTIVATION'});return;}
   const recoveryRaw=ssh('R7','R7','','',true);
   const failedPhase=first&&ctx.budget.p1.phases.find(ph=>first.step.endsWith('-'+ph));
   const plan=recoveryPlan(recoveryRaw,ctx,attempted,failedPhase);
   plan.download_window=recovery.downloadWindow(ctx,now(),plan.items);
   need(!owned||plan.reason!=='NO_OWNED_ROOT','RECOVERY_OWNED_ROOT_MISSING');
   need(attempted.length===0||plan.items.length>0||plan.first_failure_preserved===true,'RECOVERY_EMPTY');write(path.join(where.out,'RECOVERY_PLAN.json'),plan);
   if(!plan.items.length){write(path.join(where.out,'R7.json'),{status:'NOT_PERFORMED',reason:plan.reason,...(plan.metadata?{metadata:plan.metadata}:{})});need(!plan.first_failure_preserved,'RECOVERY_METADATA_ONLY_NOT_COMPLETE');return;}
   const raw=path.join(where.out,'raw');fs.mkdirSync(raw);
   const downloadRows=plan.items.map(item=>{const local=path.join(raw,...item.path.split('/'));fs.mkdirSync(path.dirname(local),{recursive:true});return {...item,local,remote:path.win32.join(ctx.budget.new_remote_root,item.path)};});
   const window=recovery.downloadWindow(ctx,now(),plan.items);
   write(path.join(where.out,'RECOVERY_DOWNLOAD_ATTEMPT.json'),window);
   if(window.status==='NOT_PERFORMED'){
    write(path.join(where.out,'R7.json'),{status:'NOT_PERFORMED',reason:'INSUFFICIENT_TIME_RESERVE_R8',window});
    need(false,'RECOVERY_DOWNLOAD_NOT_PERFORMED');
   }
   let downloadError=null;
   try{sftpBatch(ctx,where.out,transport,'download',downloadRows,now,stableInputs,raw);}
   catch(error){downloadError=error;failure('R7-download',error);}
   const verifyEnd=Math.min(now()+120000,ctx.deadline-120000,ctx.ownerEnd-120000);
   const verified=recovery.verifyDownloads(raw,plan,{now,deadline:verifyEnd});
   write(path.join(where.out,'RECOVERY_DOWNLOAD_VERIFICATION.json'),verified);
   if(downloadError)throw downloadError;
   need(verified.complete,'DOWNLOAD_INCOMPLETE');
   write(path.join(where.out,'R7.json'),{status:'PASS',complete:true,verified:verified.counts.VERIFIED,excluded:plan.excluded});
   marker.mark(raw,path.join(where.out,'REHEARSAL_CLASSIFICATION.json'),a.run_id,ctx.budget);
  },true);}catch(_){/* R8 still runs */}
  try{step('R8',()=>{
   if(!activation){write(path.join(where.out,'R8.json'),{status:'NOT_PERFORMED_NO_ACTIVATION'});return;}
   const value=lastJSON(ssh('R8','R8','','',true));need(value.ok===true&&value.kind==='POSTFLIGHT'&&value.tasks_remaining===0&&value.lock_idle===true&&Array.isArray(value.processes)&&value.processes.length===0,'POSTFLIGHT_NOT_PASS');write(path.join(where.out,'R8.json'),value);
  },true);}catch(_){/* preserve first and later failures; no retry */}
 }
 try{marker.classifyControl(where.out,a.run_id,ctx.budget);}catch(e){failure('CLASSIFICATION',e);}
 const result={schema_version:1,status:first?'HALTED':'PASS',evidence_class:ctx.mode==='DEV_CHANNEL'?'DEV_CHANNEL':TAG,run_id:a.run_id,authority_sha256:ctx.pin,
  execution_inputs:prepared.execution_inputs,run_descriptor:ctx.descriptor,execution_tools_sha256:gate.sha(gate.encode(a.execution_tools)),submitted_phases:submitted,first_failure:first,failures,transport:transport.counts,remaining_ssh:transport.limits.ssh-transport.counts.ssh,
  preflight_ssh:0,total_control_ssh:transport.counts.ssh,total_transport_sessions:transport.counts.ssh+transport.counts.sftp,formal_gate_a:false,formal_gate_b:false,automatic_retry:false,automatic_retry_scope:'PHASE_AND_CONTROL_SSH',sftp_resumptions:{upload:Math.max(0,transport.counts.upload-1),download:Math.max(0,transport.counts.download-1)},sftp_max_sessions_per_batch:3};write(path.join(where.out,'RUN_RESULT.json'),result);return result;
}
function main(argv,deps={}) {
 const args={};for(const item of argv){const m=/^--(run-descriptor|authorization)=(.+)$/.exec(item);need(m,'USAGE');const key=m[1]==='run-descriptor'?'descriptor':'authorization';need(!args[key]&&path.isAbsolute(m[2]),'ARGUMENTS');args[key]=m[2];}
 need(args.descriptor&&args.authorization,'LOCAL_INPUTS_REQUIRED');return run(args,deps);
}
module.exports={sftpBatch,verifyTransfer,transportHost,r2Body,finalInventory,run,runMigration,main,locations,makeTransport,SSH_OPTIONS,adminCommand,adminScript,adminBody,verifyStock,recoveryPlan,snapshot};
if(require.main===module){try{const r=main(process.argv.slice(2),{spawn:child.spawnSync});process.stdout.write(JSON.stringify(r,null,2)+'\n');if(r.status!=='PASS')process.exitCode=1;}
 catch(e){process.stderr.write(JSON.stringify({ok:false,error:code(e)})+'\n');process.exitCode=1;}}
