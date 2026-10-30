'use strict';
// Runs only inside the agent InteractiveToken task, after its real identity/environment probe.
const fs = require('fs');
const path = require('path');
const gate = require('./rehearsal-gate.cjs');
const chainAPI = require('./launcher-contract.cjs');
const traceAPI = require('./trace-contract.cjs');
// Parent identity remains evidence. Job membership for the request comes from
// a same-launch child, never from a guessed opposite of the parent's value.
function controllerObservation(parent, probe, phase, now = Date.now(), expected) {
  const need = (ok, code) => { if (!ok) throw new Error('CONTROLLER_PROBE_' + code); };
  need(parent && probe && probe.schema_version === 2 && probe.kind === 'A9_39_CONTROLLER_LAUNCH_PROBE'
    && probe.launcher === 'launcher-chain-v2' && probe.phase === phase, 'BINDING');
  need(probe.query_ok === true && typeof probe.in_job === 'boolean', 'IN_JOB_UNKNOWN');
  need(Number.isSafeInteger(probe.in_job_attempts) && probe.in_job_attempts >= 1 && probe.in_job_attempts <= 5
    && Number.isSafeInteger(probe.in_job_last_error) && probe.in_job_last_error >= 0, 'QUERY_DIAGNOSTICS');
  need(typeof parent.in_job === 'boolean', 'PARENT_IN_JOB_UNKNOWN');
  need(Number.isSafeInteger(parent.process_id) && parent.process_id > 0 && Number.isSafeInteger(probe.process_id)
    && probe.process_id > 0 && probe.process_id !== parent.process_id, 'PID_BINDING');
  need(expected && expected.live, 'LAUNCH_REGISTRY_MISSING');
  const chain = chainAPI.verify(probe.chain, expected, now);
  need(chain.task.pid === parent.process_id && chain.child.pid === probe.process_id
    && chain.child.ppid === probe.parent_process_id, 'PID_BINDING');
  need(typeof probe.machine_name === 'string' && typeof parent.machine_name === 'string'
    && probe.machine_name.toLowerCase() === parent.machine_name.toLowerCase(), 'IDENTITY');
  for (const key of ['account_sid','integrity_level','session_id','elevated']) need(probe[key] === parent[key], 'IDENTITY');
  need(probe.integrity_level === 'Medium' && probe.elevated === false && Number.isSafeInteger(probe.session_id)
    && probe.session_id > 0 && probe.session_id === parent.active_console_session_id, 'ORDINARY_CONSOLE');
  const pt = Date.parse(parent.observed_at_utc), ct = Date.parse(probe.observed_at_utc);
  need(Number.isFinite(now) && Number.isFinite(pt) && Number.isFinite(ct) && pt <= ct && ct <= now
    && now - pt <= 30000 && now - ct <= 30000, 'STALE');
  return {...parent, schema_version:1, kind:'A9_39_CONTROLLER_BOUND_OBSERVATION', machine_name:probe.machine_name, in_job:probe.in_job,
    parent_in_job:parent.in_job, controller_probe_pid:probe.process_id,
    in_job_attempts:probe.in_job_attempts, in_job_last_error:probe.in_job_last_error,
    observed_at_utc:probe.observed_at_utc};
}
function buildTarget(observed, accountName) {
  return {machine_name:observed.machine_name, account_name:observed.machine_name + '\\' + accountName, account_sid:observed.account_sid,
    integrity_level:observed.integrity_level, session_id:observed.session_id,
    elevated:observed.elevated, in_job:observed.in_job};
}
function run(prep, phase, observedFile) {
  const ctx = gate.inputs(prep), b = ctx.budget;
  require('./phase-plan.cjs').accept(b,phase,'product');
  const ext = path.win32.join(ctx.prep, 'external');
  const authorityFile = path.win32.join(ext, 'release-authority.json');
  const bytes = fs.readFileSync(authorityFile);
  const execution = gate.validateExecution(bytes, ctx, 'FULL'), a = execution.authority;
  const parent = gate.json(observedFile);
  const issuerChain = chainAPI.waitFile(path.win32.join(b.work_root,'observed',phase+'-issue-chain.json'));
  const issuerExpected = gate.json(path.win32.join(b.work_root,'observed',phase+'-issue-launch.json'));
  chainAPI.verify(issuerChain,issuerExpected);
  if (issuerChain.child.pid !== process.pid || issuerChain.child.ppid !== process.ppid || issuerChain.task.pid !== parent.process_id) throw new Error('CONTROLLER_PROBE_ISSUER_CHAIN');
  const probeFile = path.win32.join(b.work_root, 'observed', phase + '-controller-probe.json');
  const observed = controllerObservation(parent, gate.json(probeFile), phase, Date.now(), {...gate.json(path.win32.join(b.work_root,'observed',phase+'-controller-probe-launch.json')),live:gate.json(path.win32.join(b.work_root,'observed',phase+'-controller-probe-chain.json'))});
  const activation = gate.json(gate.activationPaths(ctx).file);
  const modulePath = path.win32.join(b.candidate_root, 'validation/a9-batch2-desktop-request.cjs');
  const manifestPath = path.win32.join(b.candidate_root, 'release-manifest.json');
  const manifestBytes = fs.readFileSync(manifestPath), manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (gate.sha(manifestBytes) !== a.candidate.manifest_sha256 || gate.sha(fs.readFileSync(modulePath)) !== manifest.files.find(x => x.path === 'validation/a9-batch2-desktop-request.cjs').sha256
    || gate.sha(fs.readFileSync(path.win32.join(b.candidate_root, 'validation/a9-batch2-fixtures.cjs'))) !== manifest.files.find(x => x.path === 'validation/a9-batch2-fixtures.cjs').sha256) throw new Error('PACKAGED_REQUEST_MODULE_HASH');
  const api = require(modulePath), fixtures = require(path.win32.join(b.candidate_root, 'validation/a9-batch2-fixtures.cjs'));
  gate.verifyPhysicalIsolation(execution.authority, process.env, ctx);
  const ledger = gate.readLedger(b.evidence_root);
  gate.requireGpuGate(ctx, phase, b.evidence_root);
  gate.verifyLedgerFiles(ledger, b.evidence_root, a);
  const externalPaths = { package_zip: path.win32.join(b.work_root, 'package/candidate.zip'),
    formal_input_lock: path.win32.join(ext, 'a9-batch2-input-lock.json'), approval_registry: path.win32.join(ext, 'a9-v26-approved-build-kits.json'), release_authority: authorityFile };
  const externalFiles = Object.fromEntries(api.externalsNeeded(fixtures.phaseById(phase)).map(key => [key,
    { path: externalPaths[key], sha256: gate.sha(fs.readFileSync(externalPaths[key])) }]));
  const request = api.createRequest({ runId: a.run_id, phase, requestIndex: ledger.filter(x => x.state === 'CONSUMED').length + 1,
    sourceCommit: a.candidate.source_commit, packageSha256: a.candidate.package_sha256, manifestSha256: a.candidate.manifest_sha256,
    kitSha256: a.candidate.kit_sha256, releaseAuthoritySha256: gate.sha(bytes), candidateRoot: b.candidate_root, evidenceRoot: b.evidence_root,
    target: buildTarget(observed, b.target_record.account_name), externalFiles });
  const verdict = gate.consume(bytes, null, ctx, 'FULL', request, ledger, observed, activation, process.env);
  const original = api.verifyRequest(request, { now: new Date(), runId: a.run_id, ledger, actual: { target: observed } });
  if (!original.ok) throw new Error('PACKAGED_VERIFY_REQUEST:' + original.problems.join(','));
  const folder = path.win32.join(b.work_root, 'requests');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.win32.join(b.work_root, 'observed', phase + '-controller-bound.json'), JSON.stringify(observed,null,2) + '\n', {encoding:'utf8',flag:'wx'});
  fs.writeFileSync(path.win32.join(folder, phase + '.json'), JSON.stringify(request, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  return verdict;
}
function finish(prep, phase) {
  const ctx = gate.inputs(prep), b = ctx.budget;
  require('./phase-plan.cjs').accept(b,phase,'product');
  const manifestBytes = fs.readFileSync(path.win32.join(b.candidate_root, 'release-manifest.json'));
  if (gate.sha(manifestBytes) !== ctx.facts.builds[0].manifest_sha256) throw new Error('FINISH_MANIFEST_HASH');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  for (const name of ['a9-batch2-smoke.cjs','a9-batch2-fixtures.cjs','a9-batch2-desktop-request.cjs']) {
    if (gate.sha(fs.readFileSync(path.win32.join(b.candidate_root, 'validation',name))) !== manifest.files.find(x => x.path === 'validation/' + name).sha256) throw new Error('FINISH_MODULE_HASH:' + name);
  }
  const smoke = require(path.win32.join(b.candidate_root, 'validation/a9-batch2-smoke.cjs'));
  const fixtures = require(path.win32.join(b.candidate_root, 'validation/a9-batch2-fixtures.cjs'));
  const dir = path.win32.join(b.evidence_root, 'rehearsal-postflight'); fs.mkdirSync(dir,{recursive:true});
  // Record a complete file inventory before scanning; reject links/special objects rather than follow them.
  function check(dirName) {
    for (const entry of fs.readdirSync(dirName,{withFileTypes:true})) {
      if (entry.isSymbolicLink()) throw new Error('FINISH_REPARSE_POINT');
      if (entry.isDirectory()) check(path.join(dirName,entry.name));
      else if (!entry.isFile()) throw new Error('FINISH_SPECIAL_FILE');
    }
  }
  const timing = traceAPI.createWriter(path.win32.join(b.new_remote_root,'trace','finish-'+phase+'.jsonl'), 'finish-trace-v1');
  try {
  const inventories = [b.evidence_root,path.win32.join(b.work_root,'logs'),b.data_root].map(root=>traceAPI.inventory(root));
  timing('inputs_fixed',{roots:inventories.map((x,i)=>({root:[b.evidence_root,path.win32.join(b.work_root,'logs'),b.data_root][i],files:x.length,bytes:x.reduce((n,r)=>n+r.bytes,0),sha256:traceAPI.digest(x)}))});
  function segment(name,fn,index){return traceAPI.segment(timing,name,fn,index===undefined?null:inventories[index]);}
  segment('check',()=>check(b.evidence_root),0);
  const scan = segment('scan(evidence)',()=>smoke.scanRun(b.evidence_root,fixtures.testOnlySecret()),0);
  const logRoot = path.win32.join(b.work_root, 'logs');
  check(logRoot);
  const logScan = segment('scan(logs)',()=>smoke.scanRun(logRoot,fixtures.testOnlySecret()),1);
  const logManifest = segment('logs-manifest',()=>smoke.buildEvidenceManifest(logRoot,[]),1);
  check(b.data_root);
  const dataScan = segment('scan(data)',()=>smoke.scanRun(b.data_root,fixtures.testOnlySecret()),2);
  const dataManifest = segment('data-manifest',()=>smoke.buildEvidenceManifest(b.data_root,[]),2);
  const listing = segment('listProcesses',()=>smoke.listProcesses(smoke.realExec));
  const roots = [b.candidate_root,b.evidence_root].map(x => x.toLowerCase());
  const residue = listing.rows.filter(x => ![process.pid,process.ppid].includes(Number(x.ProcessId))
    && roots.some(root => String(x.ImagePath || '').toLowerCase().startsWith(root)));
  const manifestOut = segment('evidence-manifest',()=>smoke.buildEvidenceManifest(b.evidence_root,[]),0);
  const output = {schema_version:1,evidence_class:gate.classification(ctx),phase, scan, log_scan:logScan, log_manifest:logManifest, data_scan:dataScan, data_manifest:dataManifest, listing_failed:listing.failed,
    processes_total:listing.rows.length,residue,manifest:manifestOut,not_a_b2_g4_verdict:true};
  segment('postflight-write',()=>fs.writeFileSync(path.win32.join(dir,phase + '.json'),JSON.stringify(output,null,2)+'\n',{encoding:'utf8',flag:'wx'}));
  timing('finish_return',{files:manifestOut.files.length});
  timing.close();
  if (!dataScan.positive_control_detected || !dataScan.phase2_controls_detected || dataScan.findings.length || !logScan.positive_control_detected || !logScan.phase2_controls_detected || logScan.findings.length || !scan.positive_control_detected || !scan.phase2_controls_detected || scan.findings.length || listing.failed || !listing.rows.length || residue.length) throw new Error('REHEARSAL_POSTFLIGHT_NOT_PASS');
  return {ok:true,evidence_class:gate.classification(ctx),phase,files:manifestOut.files.length};
  } finally { timing.close(); }
}
module.exports = { run, finish, controllerObservation, buildTarget };
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(process.argv[2] === 'finish' ? finish(process.argv[3], process.argv[4]) : run(process.argv[2], process.argv[3], process.argv[4])) + '\n'); }
  catch (e) { process.stderr.write(JSON.stringify({ ok: false, error: traceAPI.redact(e.message), detail: traceAPI.exceptionDetail(e) }) + '\n'); process.exitCode = 1; }
}
