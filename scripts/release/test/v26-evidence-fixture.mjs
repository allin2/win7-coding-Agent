// TEST_ONLY structural evidence. These PE/protocol bytes are never executed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { syntheticV25Pe, syntheticV25Evidence } from './v25-evidence-fixture.mjs';
import { requiredV26Evidence, requiredV26ManagedEvidence } from '../a9-v26-return-evidence.mjs';
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
export function syntheticV26ManagedEvidence() {
  const files = {}, rows = [];
  for (const name of ['release','cancel','cancel-release','release-cancel']) {
    const requestId = 'd013-v26-managed-' + name, profileId = 'a9-trusted-shell-current-user-v2';
    const marker = Buffer.from('A9_RELEASE_CHILD:222:639000000000000001\n');
    files[`v26-managed-${name}-request.json`] = JSON.stringify({ schemaVersion: 3, profileId, requestId, managed: true, maxStdoutBytes: 1048576, maxStderrBytes: 1048576 });
    const tokenAudit = { source:'suspended_child_process_token', verified:true, tokenType:'primary', tokenMode:'current_user', sameUser:true, restrictedToken:false, lowIntegrity:false, integritySid:'S-1-16-8192', integrityRid:8192 };
    const frames = [{schemaVersion:3,profileId,requestId,type:'execution_started',helperPid:110,childPid:111,ready:{childJobAssignmentVerified:true,inputDetached:true,stdoutCaptureReady:true,stderrCaptureReady:true},tokenAudit},
      {schemaVersion:3,profileId,requestId,type:'output_chunk',stream:'stdout',seq:1,streamOffset:0,byteLength:marker.length,dataBase64:marker.toString('base64')},
      {schemaVersion:3,profileId,requestId,type:['release','release-cancel'].includes(name)?'execution_released':'execution_result',lastOutputSeq:1,
        stdout:{rawBytesRead:marker.length,emittedBytes:marker.length,omittedBytes:0},stderr:{rawBytesRead:0,emittedBytes:0,omittedBytes:0},
        ...(['release','release-cancel'].includes(name)?{releaseId:'release-'+name,childPid:111,jobKillOnCloseDisabled:true,ownershipReleased:true}:{status:'completed',exitCode:1,executionTimeMs:500,timedOut:false,idleTimedOut:false,canceled:true,outputTruncated:false,cleanupConfirmed:true,containmentVerified:true,inputDetached:true,workDirAclModified:false,tokenAudit,hostJob:{detected:false,breakaway:'none',limitFlags:0x2000,childJobAssignmentVerified:true}})}];
    files[`v26-managed-${name}-stdout.jsonl`] = frames.map(JSON.stringify).join('\n')+'\n'; files[`v26-managed-${name}-stderr.bin`]='';
    const release = JSON.stringify({schemaVersion:3,type:'release',requestId,releaseId:'release-'+name});
    const cancel = JSON.stringify({schemaVersion:3,type:'cancel',requestId});
    rows.push({name,control:name==='release'?release:name==='cancel'?cancel:name==='release-cancel'?release+'\n'+cancel:cancel+'\n'+release,
      helper_pid:110,helper_start_ticks:'638999999999999999',root_pid:111,root_parent_pid:110,root_start_ticks:'639000000000000000',child_pid:222,child_parent_pid:111,child_start_ticks:'639000000000000001',
      root_exit_code:['release','release-cancel'].includes(name)?0:1,child_exit_code:['release','release-cancel'].includes(name)?0:1,
      identity_pinned_before_control:true,lifecycle_settled:true,root_alive_after_helper_exit:['release','release-cancel'].includes(name),child_alive_after_helper_exit:['release','release-cancel'].includes(name),exit_code:0,elapsed_ms:1000,frame_times_ms:[1,10,500]});
  }
  files['v26-managed.json']=JSON.stringify({schema_version:2,revision:'a9-31-managed-r1',rows}); return files;
}

export function createV26ReturnFixture(dir, kit, runId, suffix, mutate=()=>{}) {
  const root=path.join(dir,'TEST_ONLY-return-'+suffix);fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.mkdirSync(path.join(root,'output'));
  const managed=JSON.parse(fs.readFileSync(path.join(kit,'build-profile.json'))).managed_contract?.revision==='a9-31-managed-r1';
  const helper=syntheticV25Pe(); const lock=JSON.parse(fs.readFileSync(path.join(kit,'input-lock.json')));
  fs.writeFileSync(path.join(root,'output/helper.exe'),helper);
  for(const n of ['input-lock.json','PACKAGE_MANIFEST.json','build-profile.json','helper.exe.manifest'])fs.copyFileSync(path.join(kit,n),path.join(root,n));
  writeJson(path.join(root,'evidence/build-result.json'),{schema_version:3,status:'PASS',candidate_eligible:true,completed_at:suffix,run_id:runId,source_commit:lock.source_commit,helper_profile:managed?'D-013-v26-managed-a9-trusted-shell-current-user':'D-013-v26-a9-trusted-shell-current-user',helper_protocol:3,profile:lock.profile,architecture:'x64',toolset:'v142',windows_sdk:'10.0.19041.0',crt:'static /MT',manifest:'embedded',logic_tests:'PASS',process_capture_selftest:'PASS',win10_smoke:'PASS',pe_api_crt_analysis:'PASS',artifacts:[{path:'helper.exe',size:helper.length,sha256:digest(helper)}]});
  writeJson(path.join(root,'evidence/environment.json'),{status:'PASS',visual_studio_version:'16.11.35',msvc_version:'14.29.30133',platform_toolset:'v142',windows_sdk_version:'10.0.19041.0',network_required:false,os_caption:'Windows 10 Pro',os_version:'10.0.19045',ordinary_user:true,identity_schema_version:1,identity_probe:'win32-process-token',token_is_elevated:false,token_elevation_type:1,integrity_rid:8192,integrity_sid:'S-1-16-8192',job_probe_ok:true,in_host_job:false});
  writeJson(path.join(root,'evidence/input-verification.json'),{schema_version:1,status:'PASS',sources:lock.sources.map((e)=>({...e,status:'PASS'}))});
  for(const [name,contents] of Object.entries(syntheticV26Evidence()))fs.writeFileSync(path.join(root,'evidence',name),contents);
  if(managed){for(const [name,contents] of Object.entries(syntheticV26ManagedEvidence()))fs.writeFileSync(path.join(root,'evidence',name),contents);fs.writeFileSync(path.join(root,'evidence/version-stdout.txt'),'win7-agent-helper 1.4.1-d013-v26-managed win7-x64 profiles=v1-low-risk,v2-current-user,v3-streaming,v3-managed-release');}
  // Mutations happen before rebinding so tests exercise semantic validation, not only hashes.
  mutate(root);
  writeJson(path.join(root,'evidence/validation-binding.json'),{schema_version:1,status:'PASS',run_id:runId,source_commit:lock.source_commit,profile:lock.profile,helper_sha256:digest(fs.readFileSync(path.join(root,'output/helper.exe'))),files:[...requiredV26Evidence,...(managed?requiredV26ManagedEvidence:[])].filter((name)=>fs.existsSync(path.join(root,name))).map((name)=>{const b=fs.readFileSync(path.join(root,name));return {path:name,size:b.length,sha256:digest(b)};}),exit_codes:Object.fromEntries(['logic','capture','version','v1_smoke','v1_cancel','v2_smoke','v2_cancel','v2_overlay_reject','v3_streaming'].map((n)=>[n,0]))});
  const files=fs.readdirSync(path.join(root,'evidence')).map((n)=>'evidence/'+n).concat(['build-profile.json','helper.exe.manifest','input-lock.json','PACKAGE_MANIFEST.json','output/helper.exe'].filter(n=>fs.existsSync(path.join(root,n))));
  writeJson(path.join(root,'RETURN_PACKAGE_MANIFEST.json'),{schema_version:1,status:'PASS',candidate_eligible:true,run_id:runId,source_commit:lock.source_commit,authorized_inputs:{input_lock_sha256:digest(fs.readFileSync(path.join(kit,'input-lock.json'))),package_manifest_sha256:digest(fs.readFileSync(path.join(kit,'PACKAGE_MANIFEST.json')))},files:files.map((name)=>{const b=fs.readFileSync(path.join(root,name));return {path:name,size:b.length,sha256:digest(b)};})});
  const zip=path.join(dir,'TEST_ONLY-V26-'+suffix+'.zip');writeDeterministicZip(root,zip,1787443200);fs.writeFileSync(zip+'.sha256',digest(fs.readFileSync(zip))+'  '+path.basename(zip)+'\n');return zip;
}
