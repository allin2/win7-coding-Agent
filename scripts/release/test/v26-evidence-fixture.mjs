// TEST_ONLY structural evidence. These PE/protocol bytes are never executed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { syntheticV25Pe, syntheticV25Evidence } from './v25-evidence-fixture.mjs';
import { requiredV26Evidence } from '../a9-v26-return-evidence.mjs';
import { writeDeterministicZip } from '../zip-utils.mjs';
export const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const writeJson = (file, v) => { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file,JSON.stringify(v,null,2)+'\n'); };
export function syntheticV26Evidence() {
  const files = syntheticV25Evidence();
  files['version-stdout.txt']='win7-agent-helper 1.4.0-d013-v26 win7-x64 profiles=v1-low-risk,v2-current-user,v3-streaming';
  const tools=['cl.exe','dumpbin.exe','mt.exe','vswhere.exe','powershell.exe'].map((n) => ({path:'C:\\tools\\'+n,sha256:digest(Buffer.from(n))}));
  files['v26-tools.json']=JSON.stringify({schema_version:1,tools});
  const rows=[];
  for(const name of ['tick','utf8','cp936','utf16le','limit','cancel','backpressure']) {
    const profileId='a9-trusted-shell-current-user-v2'; const requestId='d013-v26-'+name;
    const tokenAudit={source:'suspended_child_process_token',verified:true,tokenType:'primary',tokenMode:'current_user',sameUser:true,restrictedToken:false,lowIntegrity:false,integritySid:'S-1-16-8192',integrityRid:8192};
    const encoding=name==='cp936'?'cp936':name==='utf16le'?'utf-16le':'utf-8';
    files[`v26-${name}-request.json`]=JSON.stringify({schemaVersion:3,profileId,requestId,shellKind:'cmd',command:'echo test',argv:['/d','/s','/c','echo test'],managed:false,maxStdoutBytes:name==='limit'?4096:1048576,maxStderrBytes:1048576,outputEncoding:{stdout:encoding,stderr:encoding}});
    const frames=[{schemaVersion:3,profileId,requestId,type:'execution_started',helperPid:123,childPid:124,tokenAudit,ready:{childJobAssignmentVerified:true,inputDetached:true,stdoutCaptureReady:true,stderrCaptureReady:true}}];
    const offset={stdout:0,stderr:0};let seq=0;
    const chunk=(stream, bytes) => {frames.push({schemaVersion:3,profileId,requestId,type:'output_chunk',seq:++seq,stream,streamOffset:offset[stream],byteLength:bytes.length,dataBase64:bytes.toString('base64')});offset[stream]+=bytes.length;};
    if(name==='tick') {chunk('stdout',Buffer.from('tick-1\r\n'));chunk('stdout',Buffer.from('tick-2\r\n'));chunk('stderr',Buffer.from('stderr-tick\r\n'));}
    else if(name==='limit') {chunk('stdout',Buffer.alloc(4096,'x'));frames.push({schemaVersion:3,profileId,requestId,type:'output_truncated',stream:'stdout',reason:'byte_limit'});}
    else if(name!=='backpressure') {
      const bytes=name==='cp936'?Buffer.from([0xd6,0xd0,0xce,0xc4,...Buffer.from(' no-newline\r\n')]):Buffer.from('中文 no-newline\r\n',name==='utf16le'?'utf16le':'utf8');chunk('stdout',bytes);
    }
    if(name!=='backpressure') frames.push({schemaVersion:3,profileId,requestId,type:'execution_result',status:'completed',exitCode:name==='cancel'?1:0,executionTimeMs:4000,timedOut:false,idleTimedOut:false,canceled:name==='cancel',outputTruncated:name==='limit',containmentVerified:true,inputDetached:true,cleanupConfirmed:true,workDirAclModified:false,tokenAudit,
      hostJob:{detected:false,breakaway:'none',limitFlags:8192,childJobAssignmentVerified:true},lastOutputSeq:seq,
      stdout:{rawBytesRead:name==='limit'?32768:offset.stdout,emittedBytes:offset.stdout,omittedBytes:name==='limit'?32768-offset.stdout:0},stderr:{rawBytesRead:offset.stderr,emittedBytes:offset.stderr,omittedBytes:0}});
    files[`v26-${name}-stdout.jsonl`]=frames.map((f)=>JSON.stringify(f)).join('\n')+'\n';files[`v26-${name}-stderr.bin`]='';
    rows.push({name,exit_code:name==='backpressure'?10:0,elapsed_ms:name==='tick'?4200:3000,frame_times_ms:frames.map((f,i)=>name==='tick'?[10,100,2100,2120,4100][i]:i*100),cancel_written:['cancel','backpressure'].includes(name),slow_consumer_ms:name==='backpressure'?2500:0,timed_out:false,reader_failed:false});
  }
  files['v26-streaming.json']=JSON.stringify({schema_version:1,rows});return files;
}
export function createV26ReturnFixture(dir, kit, runId, suffix, mutate=()=>{}) {
  const root=path.join(dir,'TEST_ONLY-return-'+suffix);fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.mkdirSync(path.join(root,'output'));
  const helper=syntheticV25Pe(); const lock=JSON.parse(fs.readFileSync(path.join(kit,'input-lock.json')));
  fs.writeFileSync(path.join(root,'output/helper.exe'),helper);
  for(const n of ['input-lock.json','PACKAGE_MANIFEST.json','build-profile.json','helper.exe.manifest'])fs.copyFileSync(path.join(kit,n),path.join(root,n));
  writeJson(path.join(root,'evidence/build-result.json'),{schema_version:3,status:'PASS',candidate_eligible:true,completed_at:suffix,run_id:runId,source_commit:lock.source_commit,helper_profile:'D-013-v26-a9-trusted-shell-current-user',helper_protocol:3,profile:lock.profile,architecture:'x64',toolset:'v142',windows_sdk:'10.0.19041.0',crt:'static /MT',manifest:'embedded',logic_tests:'PASS',process_capture_selftest:'PASS',win10_smoke:'PASS',pe_api_crt_analysis:'PASS',artifacts:[{path:'helper.exe',size:helper.length,sha256:digest(helper)}]});
  writeJson(path.join(root,'evidence/environment.json'),{status:'PASS',visual_studio_version:'16.11.35',msvc_version:'14.29.30133',platform_toolset:'v142',windows_sdk_version:'10.0.19041.0',network_required:false,os_caption:'Windows 10 Pro',os_version:'10.0.19045',ordinary_user:true,identity_schema_version:1,identity_probe:'win32-process-token',token_is_elevated:false,token_elevation_type:1,integrity_rid:8192,integrity_sid:'S-1-16-8192',job_probe_ok:true,in_host_job:false});
  writeJson(path.join(root,'evidence/input-verification.json'),{schema_version:1,status:'PASS',sources:lock.sources.map((e)=>({...e,status:'PASS'}))});
  for(const [name,contents] of Object.entries(syntheticV26Evidence()))fs.writeFileSync(path.join(root,'evidence',name),contents);
  // Mutations happen before rebinding so tests exercise semantic validation, not only hashes.
  mutate(root);
  writeJson(path.join(root,'evidence/validation-binding.json'),{schema_version:1,status:'PASS',run_id:runId,source_commit:lock.source_commit,profile:lock.profile,helper_sha256:digest(fs.readFileSync(path.join(root,'output/helper.exe'))),files:requiredV26Evidence.filter((name)=>fs.existsSync(path.join(root,name))).map((name)=>{const b=fs.readFileSync(path.join(root,name));return {path:name,size:b.length,sha256:digest(b)};}),exit_codes:Object.fromEntries(['logic','capture','version','v1_smoke','v1_cancel','v2_smoke','v2_cancel','v2_overlay_reject','v3_streaming'].map((n)=>[n,0]))});
  const files=fs.readdirSync(path.join(root,'evidence')).map((n)=>'evidence/'+n).concat(['build-profile.json','helper.exe.manifest','input-lock.json','PACKAGE_MANIFEST.json','output/helper.exe'].filter(n=>fs.existsSync(path.join(root,n))));
  writeJson(path.join(root,'RETURN_PACKAGE_MANIFEST.json'),{schema_version:1,status:'PASS',candidate_eligible:true,run_id:runId,source_commit:lock.source_commit,authorized_inputs:{input_lock_sha256:digest(fs.readFileSync(path.join(kit,'input-lock.json'))),package_manifest_sha256:digest(fs.readFileSync(path.join(kit,'PACKAGE_MANIFEST.json')))},files:files.map((name)=>{const b=fs.readFileSync(path.join(root,name));return {path:name,size:b.length,sha256:digest(b)};})});
  const zip=path.join(dir,'TEST_ONLY-V26-'+suffix+'.zip');writeDeterministicZip(root,zip,1787443200);fs.writeFileSync(zip+'.sha256',digest(fs.readFileSync(zip))+'  '+path.basename(zip)+'\n');return zip;
}
