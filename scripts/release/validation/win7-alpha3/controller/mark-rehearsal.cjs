'use strict';
// R7 outer classification. Does not alter or reinterpret a single raw result byte.
const fs = require('fs');
const path = require('path');
const gate = require('./rehearsal-gate.cjs');
function mark(root, out, runId, budget) {
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('RECOVERY_ROOT_SYMLINK');
  for (const key of ['download_max_files','download_max_bytes']) {
    if (!budget.p1 || !Number.isSafeInteger(budget.p1[key]) || budget.p1[key] < 1) throw new Error('RECOVERY_LIMIT_REQUIRED:' + key);
  }
  const physical = fs.realpathSync(root), destination = path.join(fs.realpathSync(path.dirname(path.resolve(out))), path.basename(out));
  const relative = path.relative(physical, destination);
  if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('MARKER_MUST_BE_OUTSIDE_RAW');
  if (runId !== budget.run_id) throw new Error('RUN_BINDING');
  const items = [];
  let total = 0;
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('RECOVERY_SYMLINK');
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) {
        total += stat.size;
        if (items.length + 1 > budget.p1.download_max_files || total > budget.p1.download_max_bytes) throw new Error('RECOVERY_BUDGET');
        const bytes = fs.readFileSync(file);
        let inner;
        if (name.endsWith('.json')) { try { inner = JSON.parse(bytes.toString('utf8')).evidence_class; } catch (_) { inner = 'UNPARSEABLE'; } }
        items.push({ path: path.relative(physical, file).split(path.sep).join('/'), bytes: stat.size, sha256: gate.sha(bytes),
          evidence_class: budget.p1.evidence_class, inner_evidence_class: inner || 'NOT_DECLARED', inner_class_eligible_for_this_run: false });
      } else throw new Error('RECOVERY_SPECIAL_FILE');
    }
  }
  walk(physical);
  if (!items.length) throw new Error('RECOVERY_EMPTY');
  const value = { schema_version: 1, run_id: runId, evidence_class: budget.p1.evidence_class, formal_gate_a: false, formal_gate_b: false,
    note: '原始字节须与当前run授权、完整账本和外层分类共同消费；开发通道不计正式证据，正式执行仍须独立审核，不自动签发门B。', files: items.length, bytes: total, items };
  fs.writeFileSync(destination, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  return value;
}
function classifyControl(root,runId,budget){
 const items=[];let bytes=0;
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('CLASSIFICATION_LINK');if(entry.isDirectory())walk(file);else if(entry.isFile()&&entry.name!=='EVIDENCE_CLASSIFICATION.json'){const raw=fs.readFileSync(file);bytes+=raw.length;items.push({path:path.relative(root,file).split(path.sep).join('/'),bytes:raw.length,sha256:gate.sha(raw),evidence_class:budget.p1.evidence_class,formal_gate_a:false,formal_gate_b:false,raw_bytes_preserved:true});if(items.length>32768||bytes>1073741824)throw Error('CLASSIFICATION_BOUND');}}}
 walk(root);const value={schema_version:1,run_id:runId,evidence_class:budget.p1.evidence_class,formal_gate_a:false,formal_gate_b:false,items};fs.writeFileSync(path.join(root,'EVIDENCE_CLASSIFICATION.json'),gate.encode(value),{flag:'wx'});return value;
}
module.exports = { mark, classifyControl };
if (require.main === module) {
  try { const ctx = gate.inputs(process.argv[2]); const result = mark(process.argv[3], process.argv[4], process.argv[5], ctx.budget);
    process.stdout.write(JSON.stringify({ ok: true, files: result.files, bytes: result.bytes, evidence_class: result.evidence_class }) + '\n'); }
  catch (error) { process.stderr.write(JSON.stringify({ ok: false, error: error.message }) + '\n'); process.exitCode = 1; }
}
