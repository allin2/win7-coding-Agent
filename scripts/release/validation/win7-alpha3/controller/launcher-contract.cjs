'use strict';
const path=require('path'),fs=require('fs'),crypto=require('crypto');
const SCHEMA='launcher-chain-v2';
const fail=code=>{throw Error('LAUNCHER_CHAIN:'+code);};
function cmdPath(value){if(typeof value!=='string'||value.length<1||value.length>240||/[\x00-\x1f\x7f"&|<>^%!()]/.test(value)||value.endsWith('\\'))fail('CMD_UNSAFE_INPUT');return '"'+value+'"';}
function render(exe,args,stdout,stderr){if(!Array.isArray(args)||args.length>32)fail('ARGUMENTS');return '/d /s /c "'+[exe,...args].map(cmdPath).join(' ')+' >'+cmdPath(stdout)+' 2>'+cmdPath(stderr)+'"';}
function creation(value){if(typeof value!=='string'||!/^\d{14}\.\d{6}[+-]\d{3}$/.test(value))fail('CREATION_UNKNOWN');const m=/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\.(\d{6})([+-])(\d{3})$/.exec(value);const utc=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]);return BigInt(utc)*1000n+BigInt(m[7])-BigInt((m[8]==='+'?1:-1)*Number(m[9])*60)*1000000n;}
function instance(p){if(!p||!Number.isSafeInteger(p.pid)||p.pid<1||!Number.isSafeInteger(p.ppid)||p.ppid<0||typeof p.image_path!=='string'||!path.win32.isAbsolute(p.image_path))fail('INSTANCE');creation(p.creation_date);return p;}
function same(a,b){instance(a);instance(b);return a.pid===b.pid&&a.creation_date===b.creation_date&&a.ppid===b.ppid&&a.image_path.toLowerCase()===b.image_path.toLowerCase();}
function verify(chain,expected,now=Date.now()){
 if(!chain||chain.schema!==SCHEMA||!expected||chain.purpose!==expected.purpose)fail('SCHEMA_PURPOSE');
 const task=instance(chain.task),cmd=instance(chain.cmd),child=instance(chain.child);
 if(new Set([task.pid,cmd.pid,child.pid]).size!==3)fail('PID_REUSE');
 if(!same(task,expected.task))fail('TASK_INSTANCE');
 if(child.ppid!==cmd.pid||cmd.ppid!==task.pid)fail('PARENT_CHAIN');
 if(cmd.image_path.toLowerCase()!==path.win32.join(expected.system_root,'System32/cmd.exe').toLowerCase())fail('CMD_IMAGE');
 const args=render(expected.exe,expected.args,expected.stdout,expected.stderr);
 if(cmd.command_line!==cmdPath(path.win32.join(expected.system_root,'System32/cmd.exe'))+' '+args)fail('CMD_COMMAND');
 if(child.image_path.toLowerCase()!==expected.exe.toLowerCase())fail('CHILD_IMAGE');
 if(!(creation(task.creation_date)<creation(cmd.creation_date)&&creation(cmd.creation_date)<creation(child.creation_date)))fail('CREATION_ORDER');
 const at=Date.parse(chain.observed_at_utc);if(!Number.isFinite(at)||at>now||now-at>30000)fail('STALE');
 if(expected.live){for(const role of ['task','cmd','child'])if(!same(chain[role],expected.live[role]))fail('PID_REUSED_LIVE');}
 return chain;
}
function waitFile(file,now=Date.now,io=fs,pause=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms)){
 const end=now()+15000;
 while(true){
  if(io.existsSync(file)){
   let raw;try{raw=io.readFileSync(file);}catch(e){if(!['ENOENT','EBUSY','EPERM','EACCES'].includes(e.code))throw e;}
   if(raw&&raw.length>65536)fail('BINDING_BOUND');
   if(raw&&raw.length){let value;try{value=JSON.parse(raw.toString('utf8'));}catch{};
    if(value&&value.schema===SCHEMA&&typeof value.purpose==='string'&&typeof value.observed_at_utc==='string'
      &&['task','cmd','child'].every(role=>value[role]&&['pid','ppid','creation_date','image_path','job'].every(key=>Object.prototype.hasOwnProperty.call(value[role],key)))
      &&typeof value.cmd.command_line==='string')return value;
   }
  }
  if(now()>=end)fail('BINDING_NOT_READY');
  pause(25);
 }
}
function registeredZombie(row,known){return !!known&&row.ProcessId===known.pid&&row.CreationDate===known.creation_date&&row.ThreadCount!==null&&row.ThreadCount!==undefined&&row.ThreadCount===0&&!row.CommandLine&&!row.ExecutablePath;}
function terminateRecheck(known,rows,queryOk){if(queryOk!==true||!Array.isArray(rows))fail('TERMINATE_QUERY_UNKNOWN');if(rows.length===0)return 'ALREADY_ENDED';if(rows.length!==1||rows[0].ProcessId!==known.pid||rows[0].CreationDate!==known.creation_date)fail('PID_REUSED_READBACK');if(registeredZombie(rows[0],known))return 'ALREADY_ENDED';fail('TERMINATE_STILL_LIVE');}
module.exports={SCHEMA,cmdPath,render,creation,instance,same,verify,waitFile,registeredZombie,terminateRecheck};
