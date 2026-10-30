'use strict';
// Local verification of the exact Git-produced manifest bytes supplied by the material producer.
// No source rewriting or manifest reserialization can repair a pin mismatch.
const fs=require('fs'),path=require('path'),c=require('./run-context.cjs'),runtime=require('./remote-inputs.cjs');
const REPO=path.resolve(__dirname,'../../../../..');
const read=file=>runtime.regular(file,REPO);
const LOCAL=Object.freeze(['admin-input.ps1','run-admin.ps1','admission.cjs','execution-tools.cjs',
 'local-entry.cjs','finalize-signing.cjs','make-run.cjs','run-rehearsal.cjs','recovery-download.cjs','mark-rehearsal.cjs']);
function need(ok,code){if(!ok)throw Error('EXECUTION_TOOLS:'+code);}
function pins(){
 const rows={};
 for(const n of runtime.sourceNames())rows['scripts/release/validation/win7-alpha3/controller/'+(n.startsWith('tools/')?n.slice(6):n)]=c.sha(read(runtime.sourceFile(n)));
 for(const n of LOCAL)rows['scripts/release/validation/win7-alpha3/controller/'+n]=c.sha(read(path.join(__dirname,n)));
 for(const n of ['authority.cjs','deny-set.cjs'])rows['scripts/release/validation/win7-alpha3/'+n]=c.sha(read(path.join(__dirname,'..',n)));
 return Object.fromEntries(Object.entries(rows).sort(([a],[b])=>a<b?-1:a>b?1:0));
}
function verify(raw,ctx){
 const m=require('./rehearsal-gate.cjs').parseJSON(raw);
 need(m&&typeof m==='object'&&!Array.isArray(m)&&JSON.stringify(Object.keys(m).sort())===JSON.stringify(['files','schema_version','source_commit']),'FIELDS');
 need(m.schema_version===1&&m.source_commit===ctx.facts.source_commit,'SOURCE');
 const actual=pins();need(JSON.stringify(Object.keys(m.files).sort())===JSON.stringify(Object.keys(actual)),'EXACT_CLOSURE');
 for(const [name,hash] of Object.entries(actual))need(m.files[name]===hash,'FILE_HASH:'+name);
 return c.sha(raw);
}
module.exports={LOCAL,pins,verify};

// The CLI supplies a read-only Git executor. Importing this module never starts a process.
function produce(ctx, git) {
 need(typeof git==='function','INJECTED_GIT_REQUIRED');
 const readGit=args=>{const raw=git(args);need(Buffer.isBuffer(raw),'GIT_OUTPUT');return raw;};
 need(readGit(['rev-parse','--show-toplevel']).toString('utf8').trim()===REPO,'GIT_ROOT');
 const head=readGit(['rev-parse','HEAD']).toString('ascii').trim();
 need(/^[a-f0-9]{40}$/.test(head)&&head===ctx.facts.source_commit,'GIT_HEAD');
 const files=pins(),names=Object.keys(files);
 const tracked=readGit(['ls-files','--stage','-z','--',...names]).toString('utf8').split('\0').filter(Boolean);
 const entries=new Map();
 for(const row of tracked){const m=/^(100644|100755) ([a-f0-9]{40}) 0\t(.+)$/.exec(row);
  need(m&&names.includes(m[3])&&!entries.has(m[3]),'GIT_TRACKED_REGULAR');entries.set(m[3],m[2]);}
 need(entries.size===names.length,'GIT_CLOSURE_UNTRACKED');
 const status=()=>need(readGit(['status','--porcelain=v1','-z','--untracked-files=all','--',...names]).length===0,'GIT_CLOSURE_DIRTY');
 status();
 for(const name of names)need(c.sha(readGit(['cat-file','blob',head+':'+name]))===files[name],'GIT_HEAD_BYTES:'+name);
 need(JSON.stringify(pins())===JSON.stringify(files),'GIT_BYTES_CHANGED');status();
 need(readGit(['rev-parse','HEAD']).toString('ascii').trim()===head,'GIT_HEAD_CHANGED');
 return c.encode({schema_version:1,source_commit:head,files});
}
module.exports.produce=produce;
