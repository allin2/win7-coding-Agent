'use strict';
// LOCAL ONLY. Assemble already supplied, unsigned run data; never invent an owner approval.
const fs = require('fs');
const path = require('path');
const context = require('./run-context.cjs');
const runtime = require('./remote-inputs.cjs');
const target = require('./target-binding.cjs');
function need(ok, code) { if (!ok) throw Error('MAKE_RUN:' + code); }
function make(data, bindingBytes, out, now = Date.now(), rawContext) {
  need(path.isAbsolute(out) && !fs.existsSync(out), 'NEW_ABSOLUTE_OUTPUT_REQUIRED');
  const ctx = context.context(data.descriptor, out, data);
  if (rawContext) { need(JSON.stringify(require('./rehearsal-gate.cjs').parseJSON(rawContext)) === JSON.stringify(data), 'RAW_CONTEXT_DATA'); ctx.runContextBytes=rawContext; }
  const pin = context.sha(bindingBytes); target.verify(bindingBytes, pin, ctx, now);
  const manifest = runtime.bind(ctx, runtime.sourcePins(), pin), files = runtime.files(ctx);
  files['external/release-authority.json'] = bindingBytes;
  files['external/RUNTIME_INPUTS.json'] = context.encode(manifest);
  // Callers must perform local-entry.prepare with the applicable authority before any target write.
  for (let at = path.dirname(out);; at = path.dirname(at)) {
    if (fs.existsSync(at)) need(fs.lstatSync(at).isDirectory() && !fs.lstatSync(at).isSymbolicLink(), 'OUTPUT_ANCESTOR');
    if (at === path.dirname(at)) break;
  }
  fs.mkdirSync(out, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    runtime.safeName(name); const file = path.join(out, name);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes, { flag: 'wx' });
  }
  return { status: 'PREPARED_NOT_AUTHORIZED', run_id: ctx.descriptor.run_id, evidence_class: ctx.descriptor.evidence_class,
    execution_binding_sha256: pin, runtime_inputs_sha256: context.sha(context.encode(manifest)) };
}
module.exports = { make };


// Material production is local only. Preserve supplied context bytes and never synthesize formal pins.
function produce(args, deps = {}) {
  need(typeof deps.git === 'function', 'INJECTED_GIT_REQUIRED');
  const raw = runtime.regular(path.resolve(args.context), path.parse(path.resolve(args.context)).root);
  const data = require('./rehearsal-gate.cjs').parseJSON(raw);
  const out = path.resolve(args.out), ctx = context.context(data.descriptor, out, data);
  ctx.runContextBytes = raw;
  const manifest = require('./execution-tools.cjs').produce(ctx, deps.git);
  const plan = context.encode(require('./phase-plan.cjs').fromBudget(ctx.budget));
  const binding = runtime.regular(path.resolve(args.binding), path.parse(path.resolve(args.binding)).root);
  const inputs = {execution_tools_manifest_sha256:context.sha(manifest),run_context_sha256:context.sha(raw),
    phase_plan_sha256:context.sha(plan),target:{session_id:ctx.budget.p1.target_session_id}};
  const materialPaths = {executionToolsManifestPath:path.join(out,'EXECUTION_TOOLS.json'),
    runContextPath:path.join(out,'external/RUN_CONTEXT.json'),phasePlanPath:path.join(out,'PHASE_PLAN.json')};
  let authorization, validated;
  if (args.authorization) {
    // Resolve caller paths before copying options; formal expected hashes stay in the signed payload.
    authorization = require('./local-entry.cjs').loadOptions(path.resolve(args.authorization));
    need(authorization.mode===undefined||authorization.mode===ctx.mode,'AUTHORIZATION_CLASS');
    need(authorization.runId===undefined||authorization.runId===ctx.descriptor.run_id,'AUTHORIZATION_RUN');
    validated = require('./local-entry.cjs').validate(ctx, {...authorization,mode:ctx.mode,runId:ctx.descriptor.run_id,
      executionBindingPath:path.join(out,'external/release-authority.json'),
      executionBindingBytes:binding,executionToolsManifestBytes:manifest,runContextBytes:raw,phasePlanBytes:plan,
      now:deps.now === undefined ? Date.now() : deps.now});
    authorization = {...authorization,...materialPaths,executionBindingPath:path.join(out,'external/release-authority.json')};
  }
  let result;
  if(fs.existsSync(out)) {
    // After signing the produced hashes, attach only AUTHORIZATION to the same material bytes.
    // No source/data file is overwritten, and no run is reserved by this step.
    need(authorization&&validated,'EXISTING_OUTPUT_REQUIRES_AUTHORIZATION');
    const expected={...validated.files,'external/release-authority.json':binding,
      'external/RUNTIME_INPUTS.json':context.encode(validated.runtime_inputs),
      'EXECUTION_TOOLS.json':manifest,'PHASE_PLAN.json':plan,'INPUT_BINDINGS.json':context.encode(inputs)};
    for(const [name,bytes] of Object.entries(expected))
      need(runtime.regular(path.join(out,name),out).equals(bytes),'EXISTING_MATERIAL_CHANGED:'+name);
    result={status:'PREPARED_NOT_AUTHORIZED',run_id:ctx.descriptor.run_id,evidence_class:ctx.mode,
      execution_binding_sha256:context.sha(binding),runtime_inputs_sha256:context.sha(context.encode(validated.runtime_inputs))};
  } else {
    // All Git/authority failures occur before creating the new output.
    result = make(data,binding,out,deps.now === undefined ? Date.now() : deps.now,raw);
    need(fs.readFileSync(materialPaths.runContextPath).equals(raw),'RAW_CONTEXT_NOT_PRESERVED');
    fs.writeFileSync(materialPaths.executionToolsManifestPath,manifest,{flag:'wx'});
    fs.writeFileSync(materialPaths.phasePlanPath,plan,{flag:'wx'});
    fs.writeFileSync(path.join(out,'INPUT_BINDINGS.json'),context.encode(inputs),{flag:'wx'});
  }
  if (authorization) fs.writeFileSync(path.join(out,'AUTHORIZATION.json'),context.encode(authorization),{flag:'wx'});
  return {...result,execution_inputs:inputs,authorization:authorization?'VALIDATED_NOT_RESERVED':'NOT_PROVIDED'};
}
function main(argv,deps={}) {
  const args={};
  for(const item of argv){const m=/^--(run-context|execution-binding|out|authorization)=(.+)$/.exec(item);
    need(m,'USAGE');const key={'run-context':'context','execution-binding':'binding',out:'out',authorization:'authorization'}[m[1]];
    need(!args[key]&&path.isAbsolute(m[2]),'ABSOLUTE_UNIQUE_ARGUMENT');args[key]=m[2];}
  need(args.context&&args.binding&&args.out,'MATERIAL_INPUTS_REQUIRED');return produce(args,deps);
}
module.exports={make,produce,main};
if(require.main===module){
  try {
    const git=args=>{const result=require('child_process').spawnSync('git',args,{cwd:path.resolve(__dirname,'../../../../..'),
      encoding:null,maxBuffer:8*1024*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_REPLACE_OBJECTS:'1'}});
      need(!result.error&&result.status===0,'GIT_READ_FAILED');return result.stdout;};
    process.stdout.write(JSON.stringify(main(process.argv.slice(2),{git}),null,2)+'\n');
  } catch(error){process.stderr.write(JSON.stringify({ok:false,error:/^(MAKE_RUN|EXECUTION_TOOLS|LOCAL_ENTRY|RUN_CONTEXT|TARGET_BINDING|AUTHORITY|DENY_SET):[A-Za-z0-9_:./-]+$/.test(error.message)?error.message:'MAKE_RUN:IO_OR_VALIDATION_FAILED'})+'\n');process.exitCode=1;}
}
