'use strict';
// Non-browser verification: actual pure model and timed scenario engine.
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'approved-demo.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const model = script.slice(0, script.indexOf('/* UI controller */'));
const later = script.slice(script.indexOf('function later('), script.indexOf('function commit('));
const flows = script.slice(script.indexOf('function execute('), script.indexOf('const sampleFiles='));
let passed = 0;
function fixture(){
  const jobs = new Map(); let seq = 0;
  const context = vm.createContext({
    console, Date,
    setTimeout(fn, ms){const id=++seq;jobs.set(id,{fn,ms});return id},
    clearTimeout(id){jobs.delete(id)},
  });
  vm.runInContext(model + '\nconst D=DemoModel;let m=D.create(),timerIds=[];\nfunction commit(){}\nfunction notice(){}\nfunction $(id){return {focus(){}}}\nfunction stopTimers(){timerIds.forEach(clearTimeout);timerIds=[]}\n' + later + flows + '\nglobalThis.testApi={D,get m(){return m},execute,stop,approve};',context);
  return {api:context.testApi,run(ms){for(const [id,j] of [...jobs])if(j.ms===ms){jobs.delete(id);j.fn()}},jobs};
}
function test(name,fn){fn();passed++;console.log('PASS '+name)}
test('syntax, static IDs and UTF-8/LF',()=>{
  assert.equal((html.match(/<style>/g)||[]).length,1,'one style opening');
  assert.equal((html.match(/<\/style>/g)||[]).length,1,'one style closing');
  assert(html.match(/<style>\s*:root\s*\{/),'design tokens must be valid first CSS rule');
  assert(!html.includes('\r'));assert.notEqual(html.charCodeAt(0),65279);
  const staticHtml=html.slice(0,html.indexOf('<script>'));
  const ids=[...staticHtml.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  assert(!/<(?:script|link|img)[^>]*(?:src|href)="https?:/i.test(html));
  assert(html.includes("connect-src 'none'"));
});
test('normal flow keeps progress, successful tools and checkpoint',()=>{
  const f=fixture(),{api}=f;api.execute('normal','demo');
  const t=api.D.turn(api.m);assert.equal(t.status,'running');assert.equal(t.events[0].type,'note');
  [1400,2900,4500,6100].forEach(n=>f.run(n));
  assert.equal(t.status,'completed');assert(t.checkpoint);assert(t.plan.every(p=>p.state==='done'));
  assert.equal(t.events.filter(e=>e.type==='tool'&&e.status==='completed').length,4);
  assert(t.events.filter(e=>e.type==='note').length>=3);
});
test('title rename, archive and restore preserve turns and draft',()=>{
  const {api}=fixture(),m=api.m,c=api.D.conv(m);
  c.title='中文标题';c.draft='示例草稿';
  const cid=c.id;assert(api.D.archive(m,cid));assert(c.archived);assert.notEqual(m.active,cid);
  assert(api.D.restore(m,cid));assert.equal(m.active,cid);assert.equal(c.draft,'示例草稿');
});
test('running work prevents switching, archiving or duplicate start',()=>{
  const {api}=fixture();api.execute('normal','first');
  assert.equal(api.D.start(api.m,'second','normal'),null);
  assert.equal(api.D.archive(api.m,api.m.active),false);
  assert.equal(api.D.switchWorkspace(api.m,'docs'),false);
  assert.equal(api.D.newConversation(api.m),null);
});
test('read-only mode forbids shell scenarios and has no checkpoint',()=>{
  const f=fixture(),{api}=f;assert(api.D.switchWorkspace(api.m,'docs'));
  for(const kind of ['push','failure','residue','retry'])assert.equal(api.D.start(api.m,'test',kind),null);
  api.execute('normal','read only');[1400,2900,4500,6100].forEach(n=>f.run(n));
  const t=api.D.turn(api.m);assert.equal(t.status,'completed');assert.equal(t.checkpoint,null);
  assert(t.events.filter(e=>e.type==='tool').every(e=>e.label.startsWith('读取')));
});
test('approval awaits a decision and records rejection without execution',()=>{
  const f=fixture(),{api}=f;api.execute('push','push');f.run(1400);f.run(2900);
  const t=api.D.turn(api.m);assert.equal(t.status,'approval');
  assert.equal(t.events.filter(e=>e.label==='执行 Git 推送').length,0);
  api.approve(false);assert.equal(t.status,'rejected');
  assert.equal(t.events.find(e=>e.type==='approval').status,'rejected');
  assert.equal(api.D.decide(api.m,true),false);
});
test('approval decision retained on success; duplicate approval rejected',()=>{
  const f=fixture(),{api}=f;api.execute('push','push');f.run(1400);f.run(2900);
  api.approve(true);assert.equal(api.D.decide(api.m,true),false);f.run(2200);
  const t=api.D.turn(api.m);assert.equal(t.status,'completed');
  const approval=t.events.find(e=>e.type==='approval');assert.equal(approval.status,'approved');assert(approval.decided);
});
test('failure remains intact after a separate successful retry',()=>{
  const f=fixture(),{api}=f;api.execute('failure','fail');[1400,2900,4500].forEach(n=>f.run(n));
  const failed=api.D.turn(api.m);assert.equal(failed.status,'failed');
  assert(failed.events.some(e=>e.type==='tool'&&e.status==='failed'));
  api.execute('retry','retry');[1400,2900,4500,6100].forEach(n=>f.run(n));
  assert.equal(failed.status,'failed');assert.equal(api.D.turn(api.m).status,'completed');
  assert.equal(api.D.turn(api.m).checkpoint,null);
  assert.equal(api.D.conv(api.m).turns.length,2);
});
test('long wait stays waiting until stopped and stops in two phases',()=>{
  const f=fixture(),{api}=f;api.execute('wait','wait');const t=api.D.turn(api.m);
  assert.equal(t.status,'waiting');assert.equal(f.jobs.size,0);
  api.stop();assert.equal(t.status,'stopping');f.run(1400);assert.equal(t.status,'cancelled');
});
test('cancel removes future steps and retains completed work',()=>{
  const f=fixture(),{api}=f;api.execute('normal','cancel');f.run(1400);
  api.stop();f.run(1400);[2900,4500,6100].forEach(n=>f.run(n));
  const t=api.D.turn(api.m);assert.equal(t.status,'cancelled');
  assert(t.events.some(e=>e.type==='tool'&&e.status==='completed'));
  assert(t.events.some(e=>e.type==='tool'&&e.status==='cancelled'));
  assert.equal(t.checkpoint,null);
});
test('residue blocks subsequent execution even after a new conversation',()=>{
  const f=fixture(),{api}=f;api.execute('residue','residue');f.run(1400);f.run(2900);
  api.stop();f.run(1400);const old=api.D.turn(api.m);assert.equal(old.status,'residue');
  api.D.newConversation(api.m);assert.equal(api.D.start(api.m,'bypass','normal'),null);
  assert.equal(api.D.unresolved(api.m).id,old.id);
  api.D.finish(old,'cancelled','cleanup','confirmed');assert(api.D.start(api.m,'next','normal'));
});
test('serialized reload preserves history and expires pending approval',()=>{
  const f=fixture(),{api}=f;api.execute('push','push');f.run(1400);f.run(2900);
  api.D.conv(api.m).draft='示例草稿';
  const saved=JSON.parse(JSON.stringify(api.m));api.D.recover(saved);
  const t=api.D.turn(saved);assert.equal(t.status,'interrupted');
  assert.equal(t.events.find(e=>e.type==='approval').status,'expired');
  assert.equal(api.D.conv(saved).draft,'示例草稿');
  const before=t.events.length;api.D.recover(saved);assert.equal(t.events.length,before);
});
test('provider unavailable cannot begin a task',()=>{
  const {api}=fixture();api.D.ws(api.m).modelReady=false;
  assert.equal(api.D.start(api.m,'test','normal'),null);
});
console.log('\n'+passed+' non-browser checks passed. Visual and browser interaction QA: NOT_PERFORMED.');
