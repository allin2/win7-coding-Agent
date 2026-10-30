import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const plan=require('../../release/validation/win7-alpha3/version-plan.cjs');
const fixture=require('./execution-binding-fixture.cjs');
const base=require('../a9-42-office-journey.cjs');
const journey=require('../journeys/lightweight.cjs');
function make(){
  const binding=JSON.parse(fixture.bytes());
  const files=Object.fromEntries(plan.STAGES.map(s=>[s.id,
    (s.id==='batch2'?Object.keys(require('../../release/validation/win7-alpha3/controller/execution-tools.cjs').pins()):base.driverClosure(path.basename(s.entry)))
      .map(name=>({path:name,sha256:fixture.sha(name)}))]));
  return plan.create({binding,targetSession:2,runs:Object.fromEntries(plan.STAGES.map(s=>[s.id,crypto.randomUUID()])),files});
}
test('version plan keeps the exact legacy matrix and requires every new stage in order',()=>{
  const p=make();assert.equal(plan.verify(p),p);assert.equal(p.legacy_cases.length,37);
  assert.equal(p.legacy_cases.flatMap(c=>c.assertions).length,67);
  assert.equal(plan.next(p,[]).id,'batch2');
  for(const mutate of [p=>p.stages.pop(),p=>p.stages[3].coverage.pop(),p=>p.stages.reverse(),
    p=>p.stages[1].run_id=p.stages[0].run_id,p=>p.limits.max_real_model_requests=61]){
    const changed=JSON.parse(JSON.stringify(p));mutate(changed);assert.throws(()=>plan.verify(changed));
  }
  const first=p.stages[0];const report={stage:first.id,run_id:first.run_id,source_commit:p.candidate.source_commit,
    package_sha256:p.candidate.package_sha256,execution_binding_sha256:first.execution_binding_sha256,
    coverage:first.coverage,status:'PASS',postflight:'PASS'};
  assert.equal(plan.next(p,[report]).id,'background-recovery');
  for(const change of [{run_id:crypto.randomUUID()},{postflight:'UNKNOWN'},{status:'HALTED'},{coverage:[]}])
    assert.throws(()=>plan.next(p,[{...report,...change}]));
});
test('the new text journey crosses actual Runtime, Gateway, Workspace and SQLite',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'a943-runtime-'));
  const workspaceRoot=path.join(root,'中文 workspace');fs.mkdirSync(workspaceRoot);
  // Pixel generation is not the behavior under this Node20 text-only test.
  journey.seed(workspaceRoot,{createFromBitmap:()=>({toPNG:()=>Buffer.from('fixture image'),toJPEG:()=>Buffer.from('fixture jpeg')})});
  const server=base.startFixture(()=>{}, {deadline:Date.now()+20000,versionTools:true});
  const url=await server.listen();
  const {createA9AgentRuntime}=require('../../../src/shell/product/a9-agent-runtime.js');
  const runtime=createA9AgentRuntime({workspaceRoot,dataRoot:path.join(root,'data'),ownerId:'main-'+process.pid});
  try{
    runtime.setMode('full_access');
    await runtime.configureProvider({baseUrl:url,model:'a943-text-fixture',skipProbe:true,imageInputEnabled:false});
    const result=await runtime.submitTurn('a943:tools:off');
    assert.ok(['completed','completed_with_warnings'].includes(result.result?.outcome),JSON.stringify(result));
    assert.equal(server.state.errors.length,0,server.state.errors.join(','));
    assert.equal(server.state.lightweight?.done,true);
    assert.equal(server.state.lightweight.results.length,6);
    assert.equal(fs.readFileSync(path.join(workspaceRoot,journey.NOTE),'utf8'),'第一行\n新锚点\n第三行\n');
    const Database=require('better-sqlite3');const db=new Database(path.join(root,'data/a9-state.db'),{readonly:true});
    try{
      const events=db.prepare('SELECT event_type,payload_json FROM a9_events').all();
      assert.ok(events.some(e=>e.payload_json.includes('edit')));
      assert.ok(events.some(e=>e.payload_json.includes('a943-sample')));
    }finally{db.close();}
  }finally{await runtime.shutdown();await server.close();}
});
