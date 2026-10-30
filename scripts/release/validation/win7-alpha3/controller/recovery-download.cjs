'use strict';
// Candidate-external, Node builtins. Called only AFTER the recovery scan/treehash gates.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const DOWNLOAD_SECONDS=600,R8_RESERVE_SECONDS=120;
const COPY_PATH='e/driver-electron/electron.exe';
const ELECTRON_BYTES=157602304,ELECTRON_SHA='2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb';
const sensitive=p=>/(?:^|\/)(?:vault|credentials)(?:[/.]|$)/i.test(p);
function candidateByte(ctx){
 if(!ctx.prep||!ctx.facts||!ctx.facts.builds)return {available:false,reason:'NO_LOCAL_CANDIDATE_CONTEXT'};
 const build=ctx.facts.builds[0],zipPath=path.resolve(ctx.repo||ctx.prep,build.zip);
 const entry=build.zip_top+'/electron.exe';
 try{
  if(!fs.existsSync(zipPath))return {available:false,reason:'LOCAL_CANDIDATE_MISSING'};
  if(!fs.lstatSync(zipPath).isFile()||fs.realpathSync(zipPath)!==zipPath)return {available:false,reason:'LOCAL_CANDIDATE_LINK'};
  const zip=fs.readFileSync(zipPath),zipSha=sha(zip);
  if(zipSha!==build.sha256||zip.length!==build.bytes)return {available:false,reason:'LOCAL_CANDIDATE_BINDING_MISMATCH'};
  let end=zip.length-22;while(end>=Math.max(0,zip.length-65557)&&zip.readUInt32LE(end)!==0x06054b50)end--;
  if(end<0||zip.readUInt32LE(end)!==0x06054b50)throw Error('ZIP_END');
  let pos=zip.readUInt32LE(end+16),found=null;
  for(let i=0;i<zip.readUInt16LE(end+10);i++){
   if(zip.readUInt32LE(pos)!==0x02014b50)throw Error('ZIP_CENTRAL');
   const n=zip.readUInt16LE(pos+28),extra=zip.readUInt16LE(pos+30),comment=zip.readUInt16LE(pos+32);
   if(zip.subarray(pos+46,pos+46+n).toString('utf8')===entry){
    if(found)throw Error('ZIP_DUPLICATE_ENTRY');
    const method=zip.readUInt16LE(pos+10),packedSize=zip.readUInt32LE(pos+20),size=zip.readUInt32LE(pos+24),offset=zip.readUInt32LE(pos+42);
    if(size!==ELECTRON_BYTES||zip.readUInt32LE(offset)!==0x04034b50||![0,8].includes(method))throw Error('ZIP_ENTRY');
    const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28),packed=zip.subarray(start,start+packedSize);
    const plain=method===0?packed:zlib.inflateRawSync(packed,{maxOutputLength:ELECTRON_BYTES});
    if(plain.length!==size)throw Error('ZIP_SIZE');
    found={available:true,zip_path:zipPath,zip_sha256:zipSha,entry,bytes:plain.length,sha256:sha(plain)};
   }
   pos+=46+n+extra+comment;
  }
  if(!found||found.sha256!==ELECTRON_SHA)return {available:false,reason:'LOCAL_CANDIDATE_ENTRY_MISMATCH'};
  return found;
 }catch(error){return {available:false,reason:'LOCAL_CANDIDATE_READ_FAILED',code:typeof error.code==='string'?error.code:'INVALID_ZIP'};}
}
function priority(item,failedPhase){
 const p=item.path,base=p.slice(p.lastIndexOf('/')+1),phaseFile=/\/(?:phase-result|request)\.json$/.test(p);
 if((failedPhase&&p.includes('-'+failedPhase+'/')&&phaseFile)||/^a\d+-\d+\.json$/i.test(base)||/^driver-secrets_a\d+_\d+\.json$/i.test(base)||['driver-launches.json','provider-requests.jsonl'].includes(base))return 0;
 if(/^e\/driver-(?:electron|app)\//.test(p))return 2;
 if(/^e\/rehearsal-postflight\//.test(p)||/^trace\//.test(p)||/^e\/gpu-entry-gate\/(?:task-identity|cleanup-proof|gate-result|FIRST_FAILURE|capturer-(?:claim|ack|events)|app-events)\./.test(p)||phaseFile||/request-ledger|trace-seal|finish-|scan|manifest|lifecycle|checkpoint/i.test(p)||/^w\/(?:observed|task-readback|attempts|requests)\//.test(p)||(/restore|recovery|baseline|backup/i.test(p)&&item.bytes<=1048576))return 1;
 return 2;
}
function selectApproved(items,excluded,ctx,failedPhase){
 const candidate=candidateByte(ctx),kept=[],omitted=excluded.map(x=>({...x}));let excludedCopy=false;
 for(const item of items){
  if(sensitive(item.path))throw Error('RUN_REHEARSAL:RECOVERY_FORBIDDEN_FILE');
  if(!excludedCopy&&item.path===COPY_PATH&&candidate.available===true&&item.sha256===candidate.sha256&&item.bytes===candidate.bytes){
   omitted.push({...item,status:'NOT_DOWNLOADED_IDENTICAL_CANDIDATE_BYTE',run_id:ctx.budget.run_id,remote_path:path.win32.join(ctx.budget.new_remote_root,item.path),candidate_zip_sha256:candidate.zip_sha256,candidate_entry:candidate.entry});excludedCopy=true;
  }else kept.push({...item,priority:priority(item,failedPhase)});
 }
 kept.sort((a,b)=>a.priority-b.priority||a.bytes-b.bytes||(a.path<b.path?-1:a.path>b.path?1:0));
 return {items:kept,excluded:omitted,candidate_byte:candidate,failed_phase:failedPhase||null,sort_key:['priority','bytes','path']};
}
function transferSeconds(bytes,files,original=600){
 if(!Number.isSafeInteger(bytes)||bytes<0||!Number.isSafeInteger(files)||files<0||!Number.isSafeInteger(original)||original<0)throw Error('RUN_REHEARSAL:TRANSFER_PLAN_INVALID');
 const seconds=Math.max(original,Math.ceil(bytes/40000)+2*files);if(!Number.isSafeInteger(seconds))throw Error('RUN_REHEARSAL:TRANSFER_PLAN_INVALID');return seconds;
}
function transferPlan(items){
 if(!Array.isArray(items))throw Error('RUN_REHEARSAL:TRANSFER_PLAN_INVALID');let bytes=0;
 for(const row of items){if(!row||!Number.isSafeInteger(row.bytes)||row.bytes<0)throw Error('RUN_REHEARSAL:TRANSFER_PLAN_INVALID');bytes+=row.bytes;}
 if(!Number.isSafeInteger(bytes))throw Error('RUN_REHEARSAL:TRANSFER_PLAN_INVALID');return {bytes,files:items.length,seconds:transferSeconds(bytes,items.length)};
}
function transportDisconnect(result){
 if(!result||!['upload','download'].includes(result.kind)||!Number.isSafeInteger(result.status)||(result.status<1||result.status>255)||result.error||result.signal)return false;
 const text=String(result.stderr||'');
 // A 255 exit alone never overrides a security, protocol, integrity or local input failure.
 if(/host key|host identification|permission denied|authentication|publickey|private key|bad permissions|load key|identity file|agent refused|no matching|protocol|bad message|invalid packet|received message too long|subsystem request failed|no such file|not found|not a (?:regular file|directory)|couldn.t (?:stat|open|create|canonicali[sz]e)|cannot|failure|checksum|sha256|integrity|mismatch|larger than|corrupt|local[_ ]input|input[_ ]changed|material[_ ]changed|disk full|no space|read-only|invalid argument/i.test(text))return false;
 return result.status===255||/connection (?:closed|reset|timed out)|broken pipe|connection to [^\r\n]+ closed|operation timed out/i.test(text);
}
function uploadRemainder(items,commands,stdout){
 const unqueried=(row,state)=>{const {transfer_verb,remaining_bytes,...input}=row;return {...input,upload_state:state};};
 const unknown=()=>items.map(row=>unqueried(row,'ECHO_UNKNOWN'));
 const echoes=String(stdout||'').split(/\r?\n/).filter(x=>x.startsWith('sftp>'));let count=0;
 if(!echoes.length||commands.length!==items.length)return unknown();
 for(const line of echoes){if(count>=commands.length||!/^(?:put|reput) /.test(commands[count])||line!=='sftp> '+commands[count])return unknown();count++;}
 // The next command echo confirms the previous command returned success in abort-on-error batch mode.
 // No remote offset can be proved after disconnection: retain the interrupted file's FULL length as an upper bound.
 // Echoes only shrink the query set. No verb is selected until remote state has been checked.
 return items.slice(count-1).map((row,index)=>unqueried(row,index===0?'ECHO_LAST':'ECHO_NOT_STARTED'));
}
function uploadState(items,result,budget){
 const fail=()=>{throw Error('RUN_REHEARSAL:UPLOAD_STATE_INVALID');};
 if(!result||Object.keys(result).sort().join(',')!=='account_sid,items,kind,machine_name,ok,remote_root'||result.ok!==true||result.kind!=='UPLOAD_STATE'||result.remote_root!==budget.new_remote_root||typeof result.machine_name!=='string'||result.machine_name.toLowerCase()!==budget.target_machine.toLowerCase()||result.account_sid!==budget.target_sid||!Array.isArray(result.items)||result.items.length!==items.length||items.length>64)fail();
 const pending=[];
 for(let i=0;i<items.length;i++){
  const row=items[i],state=result.items[i];
  if(typeof row.remote!=='string'||!row.remote.startsWith(budget.new_remote_root+'\\')||!state||Object.keys(state).sort().join(',')!=='bytes,exists,path'||state.path!==row.remote||typeof state.exists!=='boolean')fail();
  if(!state.exists){if(state.bytes!==null)fail();pending.push({...row,remaining_bytes:row.bytes,transfer_verb:'put',upload_state:'REMOTE_ABSENT'});continue;}
  if(!Number.isSafeInteger(state.bytes)||state.bytes<0)fail();
  if(state.bytes>row.bytes)throw Error('RUN_REHEARSAL:UPLOAD_REMOTE_SIZE_MISMATCH');
  if(state.bytes<row.bytes)pending.push({...row,remaining_bytes:row.bytes-state.bytes,transfer_verb:'reput',upload_state:'REMOTE_PARTIAL'});
 }
 return pending;
}
function downloadRemainder(raw,items,now=Date.now,end=Infinity){
 const pending=[],pins=[];let bytes=0;
 const expected=new Set(items.map(row=>row.local));let walked=0;
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(now()>=end||++walked>32768)throw Error('RUN_REHEARSAL:RESUME_PROGRESS_DEADLINE');
  const file=path.join(dir,entry.name);if(entry.isSymbolicLink()||(!entry.isFile()&&!entry.isDirectory())||(entry.isFile()&&!expected.has(file)))throw Error('RUN_REHEARSAL:RESUME_LOCAL_INPUT_CHANGED');
  if(entry.isDirectory())walk(file);
 }}
 if(fs.lstatSync(raw).isSymbolicLink()||fs.realpathSync(raw)!==raw)throw Error('RUN_REHEARSAL:RESUME_LOCAL_INPUT_CHANGED');walk(raw);
 for(const row of items){
  if(now()>=end)throw Error('RUN_REHEARSAL:RESUME_PROGRESS_DEADLINE');
  let size=0,pin=null;
  for(let at=path.dirname(row.local);;at=path.dirname(at)){
   const st=fs.lstatSync(at);if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(at)!==at)throw Error('RUN_REHEARSAL:RESUME_LOCAL_INPUT_CHANGED');
   if(at===raw)break;if(at===path.dirname(at))throw Error('RUN_REHEARSAL:RESUME_LOCAL_INPUT_CHANGED');
  }
  try{const st=fs.lstatSync(row.local);if(!st.isFile()||st.isSymbolicLink()||fs.realpathSync(row.local)!==row.local)throw Error('RUN_REHEARSAL:RESUME_LOCAL_INPUT_CHANGED');
   const body=fs.readFileSync(row.local);size=body.length;pin={file:row.local,bytes:size,sha256:sha(body),ino:st.ino,dev:st.dev};
   if(size>row.bytes||(size===row.bytes&&pin.sha256!==row.sha256))throw Error('RUN_REHEARSAL:RESUME_INTEGRITY_MISMATCH');
  }catch(error){if(error.code!=='ENOENT')throw error;}
  pins.push(pin||{file:row.local,missing:true});
  if(size<row.bytes||!pin){pending.push({...row,remaining_bytes:row.bytes-size,transfer_verb:pin?'reget':'get',download_state:pin?'PARTIAL':'NOT_STARTED'});bytes+=row.bytes-size;}
 }
 if(now()>=end)throw Error('RUN_REHEARSAL:RESUME_PROGRESS_DEADLINE');
 return {pending,pins,bytes,files:pending.length};
}
function verifyProgressPins(pins){
 for(const pin of pins){
  if(pin.missing){if(fs.existsSync(pin.file))throw Error('RUN_REHEARSAL:RESUME_LOCAL_INPUT_CHANGED');continue;}
  const st=fs.lstatSync(pin.file);if(!st.isFile()||st.isSymbolicLink()||fs.realpathSync(pin.file)!==pin.file||st.ino!==pin.ino||st.dev!==pin.dev||st.size!==pin.bytes||sha(fs.readFileSync(pin.file))!==pin.sha256)throw Error('RUN_REHEARSAL:RESUME_LOCAL_INPUT_CHANGED');
 }
}
function downloadWindow(ctx,now,items=[]){
 const plan=transferPlan(items),timeout=Math.floor(Math.min(plan.seconds*1000,ctx.deadline-now-R8_RESERVE_SECONDS*1000,ctx.ownerEnd-now-R8_RESERVE_SECONDS*1000));
 return {status:timeout>0?'READY':'NOT_PERFORMED',timeout_ms:Math.max(0,timeout),planned_bytes:plan.bytes,planned_files:plan.files,download_cap_seconds:plan.seconds,r8_reserved_seconds:R8_RESERVE_SECONDS,common_deadline:ctx.deadline,owner_deadline:ctx.ownerEnd};
}
function verifyDownloads(raw,plan,options={}){
 const now=options.now||Date.now,end=options.deadline===undefined?Infinity:options.deadline,items=[],extras=[],expected=new Set(plan.items.map(x=>x.path));
 const started=now();let expired=false;
 function validAncestors(file){for(let dir=file;;dir=path.dirname(dir)){const stat=fs.lstatSync(dir);if(stat.isSymbolicLink()||fs.realpathSync(dir)!==dir)return false;if(dir===raw)return true;if(dir===path.dirname(dir))return false;}}
 for(const item of plan.items){
  const file=path.join(raw,...item.path.split('/'));let status='MISSING',reason='NOT_ON_DISK',actual=null;
  try{
   const stat=fs.lstatSync(file);status='PARTIAL';reason='HASH_LENGTH_OR_LINK';
   if(!validAncestors(file)||!stat.isFile())reason='LINK_OR_SPECIAL_FILE';
   else if(now()>=end){expired=true;reason='VERIFICATION_DEADLINE';}
   else{const bytes=fs.readFileSync(file);actual={bytes:bytes.length,sha256:sha(bytes)};if(actual.bytes===item.bytes&&actual.sha256===item.sha256){status='VERIFIED';reason=null;}}
  }catch(error){if(error.code!=='ENOENT'){status='PARTIAL';reason='READ_FAILED';}}
  items.push({...item,status,reason,actual});
 }
 let walked=0;
 function walk(dir){
  if(now()>=end){expired=true;return;}
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name),rel=path.relative(raw,file).split(path.sep).join('/');
   if(++walked>32768){expired=true;return;}
   if(entry.isSymbolicLink()||(!entry.isFile()&&!entry.isDirectory()))extras.push({path:rel,reason:'LINK_OR_SPECIAL_FILE'});
   else if(entry.isDirectory())walk(file);
   else if(!expected.has(rel))extras.push({path:rel,reason:'UNPLANNED_FILE'});
  }
 }
 try{if(fs.lstatSync(raw).isSymbolicLink()||fs.realpathSync(raw)!==raw)extras.push({path:'.',reason:'ROOT_LINK'});else walk(raw);}catch(error){extras.push({path:'.',reason:'LIST_FAILED'});}
 const counts={VERIFIED:items.filter(x=>x.status==='VERIFIED').length,PARTIAL:items.filter(x=>x.status==='PARTIAL').length,MISSING:items.filter(x=>x.status==='MISSING').length};
 const complete=items.length>0&&counts.VERIFIED===items.length&&extras.length===0&&!expired;
 return {status:complete?'PASS':'INCOMPLETE',complete,counts,items,extra_files:extras,verification_deadline_exceeded:expired,wall_ms:now()-started,excluded:plan.excluded||[],definition:'All selected files VERIFIED; no links, special/extra files or verification timeout. Explicit exclusions remain NOT_DOWNLOADED and are never target behavior evidence.'};
}
module.exports={transportDisconnect,uploadRemainder,uploadState,downloadRemainder,verifyProgressPins,transferSeconds,transferPlan,candidateByte,priority,selectApproved,downloadWindow,verifyDownloads,DOWNLOAD_SECONDS,R8_RESERVE_SECONDS,COPY_PATH};
