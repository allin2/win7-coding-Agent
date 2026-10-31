'use strict';
// Local version assembly only. Existing target launchers retain their own authorization and identity gates.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const authority = require('./authority.cjs');
const base = require('../../../win7-dev/a9-42-office-journey.cjs');
const batch2 = require('../../../../release/win7-product-v3/a9-batch2-fixtures.cjs');
const STAGES = Object.freeze([
  { id:'batch2', entry:'scripts/release/validation/win7-alpha3/controller/run-rehearsal.cjs',
    coverage:['BATCH2-37-67'], result:'batch2', real:false },
  { id:'background-recovery', entry:'scripts/win7-dev/a9-3440-trial.cjs',
    coverage:['A34-RECOVERY','A40-PROGRESS'], result:'a93440', real:false },
  { id:'portable', entry:'scripts/win7-dev/a9-3440-trial.cjs',
    coverage:['A40-PORTABLE'], result:'portable-smoke', real:false },
  { id:'office-tools', entry:'scripts/win7-dev/a9-42-office-journey.cjs',
    coverage:['A41-WORKBENCH','A42-EDIT','A42-ENV','A42-SKILLS','A42-QUESTION','A42-IMAGE','A42-OFFICE'],
    result:'office-journey', real:false },
  { id:'real-model', entry:'scripts/win7-dev/a9-42-real-model-trial.cjs',
    coverage:['A42-REAL'], result:'office-real-model', real:true },
]);
const REQUIRED = Object.freeze(STAGES.flatMap(s=>s.coverage));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const encode = v => Buffer.from(JSON.stringify(v,null,2)+'\n');
function need(ok,code){if(!ok)throw Error('VERSION_PLAN:'+code);}
function runId(v){need(typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v),'RUN_ID');return v;}
function exact(v,keys,code){need(v&&JSON.stringify(Object.keys(v).sort())===JSON.stringify(keys.slice().sort()),code);}
function create({ binding, targetSession, runs, files }) {
  authority.validateExecutionBinding(binding);
  need(Number.isSafeInteger(targetSession)&&targetSession>0,'SESSION');
  exact(runs,STAGES.map(s=>s.id),'RUN_SET');
  const seen = new Set();
  const stages=STAGES.map((s,index)=>{
    const run=runId(runs[s.id]); const prefix=run.slice(0,8);
    need(!seen.has(prefix),'RUN_COLLISION');seen.add(prefix);
    const execution={...binding,run_id:run}; const layout=base.expandExecutionLayout(execution);
    need(Array.isArray(files[s.id])&&files[s.id].length>0,'CODE_CLOSURE');
    return {...s,order:index+1,run_id:run,run_root:layout.run_root,task_prefix:layout.task_prefix,
      execution_binding_sha256:sha(encode(execution)), execution_files:files[s.id],
      target_session:targetSession, status:'NOT_PERFORMED'};
  });
  return {schema_version:1,kind:'A9_43_VERSION_EXECUTION_PLAN',evidence_class:binding.evidence_class,
    formal_input_lock_sha256:binding.formal_input_lock_sha256,approval_registry:binding.approval_registry,
    candidate:binding.candidate,target:{...binding.target,session_id:targetSession},
    limits:{max_wall_seconds:24300,max_windows:5,max_real_model_requests:60},
    measured_duration_seconds:'UNKNOWN', stages,
    legacy_cases:batch2.CASES.map(c=>({case_id:c.case_id,assertions:c.assertions.map(a=>a.assertion_id)})),
    excluded_supplement:['M1','M2','M3','M4','M5','M6'],authority:'NOT_PROVIDED',target_preflight:'NOT_PERFORMED'};
}
function verify(plan) {
  need(plan&&plan.schema_version===1&&plan.kind==='A9_43_VERSION_EXECUTION_PLAN','SCHEMA');
  need(['DEV_CHANNEL','FORMAL_GATE_A_EXECUTION'].includes(plan.evidence_class),'CLASS');
  need(plan.limits.max_wall_seconds===24300&&plan.limits.max_windows===5&&plan.limits.max_real_model_requests===60,'LIMITS');
  need(plan.stages.length===STAGES.length,'STAGE_COUNT');
  const execution={schema_version:1,kind:'WIN7_56_EXECUTION_BINDING',evidence_class:plan.evidence_class,
    run_id:plan.stages[0].run_id,formal_input_lock_sha256:plan.formal_input_lock_sha256,approval_registry:plan.approval_registry,
    candidate:plan.candidate,target:{machine_name:plan.target.machine_name,account_sid:plan.target.account_sid}};
  authority.validateExecutionBinding(execution);
  const seen=new Set();
  for(let i=0;i<STAGES.length;i++){
    const s=plan.stages[i],e=STAGES[i];
    need(s.id===e.id&&s.entry===e.entry&&s.order===i+1&&s.result===e.result&&s.real===e.real,'STAGE_IDENTITY');
    need(JSON.stringify(s.coverage)===JSON.stringify(e.coverage),'COVERAGE');
    const id=runId(s.run_id),prefix=id.slice(0,8);need(!seen.has(prefix),'RUN_COLLISION');seen.add(prefix);
    need(s.run_root==='C:\\A9-DEV\\run\\'+prefix&&s.task_prefix==='A9-DEV-'+prefix+'-','LAYOUT');
    need(s.target_session===plan.target.session_id&&Number.isSafeInteger(s.target_session)&&s.target_session>0,'SESSION');
    need(sha(encode({...execution,run_id:s.run_id}))===s.execution_binding_sha256,'BINDING_SHA');
    need(Array.isArray(s.execution_files)&&s.execution_files.length>0,'CODE_CLOSURE');
    const names=new Set(); for(const f of s.execution_files){
      need(typeof f.path==='string'&&!names.has(f.path)&&/^[a-f0-9]{64}$/.test(f.sha256),'FILE_PIN');names.add(f.path);
    }
    const expected=e.id==='batch2'?Object.keys(require('./controller/execution-tools.cjs').pins()):base.driverClosure(path.basename(e.entry));
    need(JSON.stringify([...names].sort())===JSON.stringify(expected.sort()),'CODE_SET');
  }
  need(JSON.stringify(plan.legacy_cases)===JSON.stringify(batch2.CASES.map(c=>({case_id:c.case_id,assertions:c.assertions.map(a=>a.assertion_id)}))),'LEGACY_CASES');
  return plan;
}
function next(plan,reports){
  verify(plan);need(Array.isArray(reports),'REPORTS');
  need(reports.length<=STAGES.length,'REPORT_COUNT');
  for(let i=0;i<reports.length;i++){
    const r=reports[i],s=plan.stages[i];
    need(r.stage===s.id&&r.run_id===s.run_id&&r.source_commit===plan.candidate.source_commit
      &&r.package_sha256===plan.candidate.package_sha256&&r.execution_binding_sha256===s.execution_binding_sha256,'REPORT_BINDING');
    need(r.status==='PASS'&&r.postflight==='PASS'&&JSON.stringify(r.coverage)===JSON.stringify(s.coverage),'PRIOR_STAGE_NOT_COMPLETE');
  }
  return reports.length===STAGES.length?null:plan.stages[reports.length];
}
async function prepare(spec){
  const repo=path.resolve(__dirname,'../../../..');
  need(spec&&Number.isSafeInteger(spec.real_model_request_limit)&&spec.real_model_request_limit>=1&&spec.real_model_request_limit<=40,'MODEL_LIMIT');
  need(spec&&path.isAbsolute(spec.output_root)&&!fs.existsSync(spec.output_root),'NEW_OUTPUT');
  need(path.isAbsolute(spec.execution_binding_path)&&path.isAbsolute(spec.zip_path),'INPUT_PATHS');
  const raw=fs.readFileSync(spec.execution_binding_path), binding=authority.validateExecutionBinding(JSON.parse(raw));
  need(binding.candidate.source_commit===spec.source_commit,'SOURCE');
  const git=args=>require('child_process').execFileSync('git',args,{cwd:repo,maxBuffer:8*1024*1024});
  need(git(['rev-parse','HEAD']).toString().trim()===spec.source_commit,'HEAD');
  need(sha(fs.readFileSync(spec.zip_path))===binding.candidate.package_sha256,'PACKAGE_SHA');
  const entries={};const office=require('../../../win7-dev/a9-42-office-prepare.cjs');
  for(const stage of STAGES){
    if(stage.id==='batch2') entries[stage.id]=Object.entries(require('./controller/execution-tools.cjs').pins()).map(([p,h])=>({path:p,sha256:h}));
    else entries[stage.id]=office.verifyExecutionSource({source_root:repo,source_commit:spec.source_commit},path.basename(stage.entry));
  }
  // The assembly and preparers are execution tools as well; require committed current bytes.
  const localFiles=['scripts/release/validation/win7-alpha3/version-plan.cjs','scripts/win7-dev/a9-42-office-prepare.cjs','scripts/win7-dev/a9-42-real-model-prepare.cjs'];
  for(const name of localFiles)need(sha(git(['show',spec.source_commit+':'+name]))===sha(fs.readFileSync(path.join(repo,name))),'LOCAL_SOURCE');
  const plan=create({binding,targetSession:spec.session_id,runs:spec.runs,files:entries});verify(plan);
  fs.mkdirSync(spec.output_root,{recursive:true});
  for(const stage of plan.stages){
    const dir=path.join(spec.output_root,stage.id);fs.mkdirSync(dir);
    const execution={...binding,run_id:stage.run_id};const bindingFile=path.join(dir,'execution-binding.json');
    fs.writeFileSync(bindingFile,encode(execution),{flag:'wx'});
    if(stage.id==='batch2')continue; // Actual FULL context/window still comes from the existing controller producer.
    const s={source_root:repo,source_commit:spec.source_commit,zip_path:spec.zip_path,output_root:path.join(dir,'materials'),
      run_id:stage.run_id,session_id:spec.session_id,execution_binding_path:bindingFile,
      target_tools_root:base.expandExecutionLayout(execution).tools_root};
    if(stage.id==='real-model')await require('../../../win7-dev/a9-42-real-model-prepare.cjs').prepare({...s,
      model:spec.model,idle_seconds:60,real_model_request_limit:Math.min(spec.real_model_request_limit,40)});
    else await office.prepare(s,{entry:path.basename(stage.entry),portable:stage.id==='portable'});
  }
  fs.writeFileSync(path.join(spec.output_root,'VERSION_PLAN.json'),encode(plan),{flag:'wx'});
  return {status:'PREPARED_NOT_AUTHORIZED',output_root:spec.output_root,source_commit:spec.source_commit,
    version_plan_sha256:sha(encode(plan)),stages:plan.stages.length,win7:'NOT_PERFORMED'};
}
module.exports={STAGES,REQUIRED,create,verify,next,prepare};
if(require.main===module){prepare(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))).then(r=>process.stdout.write(JSON.stringify(r)+'\n'))
  .catch(e=>{process.stderr.write(/^(VERSION_PLAN|PREPARE)_?[A-Z:_]+$/.test(e.message)?e.message+'\n':'VERSION_PLAN:PREPARATION_FAILED\n');process.exitCode=1;});}
