'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PHASES = Object.freeze(['Boot', 'Background', 'Shell', 'EncodingSecurity', 'FailureBoundaries', 'StopExit', 'ReleaseExit', 'Recovery']);
const FILES = Object.freeze(['input-binding.cjs', 'product-driver.cjs', 'stage-product.ps1', 'launch-product-desktop.ps1', 'serve-product-desktop.ps1', 'launch-manifest-observer.ps1', 'exit-dialog-action.cjs']);
const POLICY = Object.freeze({ phases: PHASES, request_limit: 16, validity_minutes: 120, native_dialog_timeout_ms: 120000, manifest_tolerance_ticks: '160000', capture_clock: 'LOCKED_KERNEL32_PRECISE_UTC_FILETIME_V1_TEST_ONLY', sync_clock: 'LOCKED_CLR_LIBUV_QPC_NS_V1_TEST_ONLY', snapshot_margin_ns: '4096' });
const APPROVAL = Object.freeze({ scope: 'LOCAL_IMPLEMENTATION_ONLY', task_sha256: '58a569b468c27cd171699ff2a2a3ebfdd38197521fc51136f5a3e94fe687913a', adr_sha256: 'cd99824d9eabc440e1633fcc67a0e8c0d64543f55f2a7b27881c2cf548120b81' });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function reject(code) { throw Object.assign(new Error(code), { code }); }
function keys(o, expected, code = 'INTEGRITY_FIELDS') {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).sort().join() !== [...expected].sort().join()) reject(code);
}
function hash(v) { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) reject('INTEGRITY_HASH'); }
function source(v) { if (typeof v !== 'string' || !/^[a-f0-9]{40}$/.test(v)) reject('INTEGRITY_SOURCE'); }
function identifier(v) { if (typeof v !== 'string' || !/^[a-f0-9]{32}$/.test(v)) reject('INTEGRITY_RUN_ID'); }
function ticks(v) { if (typeof v !== 'string' || !/^[1-9][0-9]{17}$/.test(v)) reject('LIFECYCLE_CREATION_TICKS'); }
function equal(a, b, code) { if (JSON.stringify(a) !== JSON.stringify(b)) reject(code); }

// Inspect keys before JSON.parse discards duplicates. No eval or coercion.
function parseStrict(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 4 * 1024 * 1024 || text.charCodeAt(0) === 0xfeff) reject('INTEGRITY_JSON_BYTES');
  let at = 0;
  const whitespace = () => { while (/\s/.test(text[at] || '') && at < text.length) at++; };
  function string() {
    const start = at++;
    while (at < text.length) { const c = text[at++]; if (c === '\\') at++; else if (c === '"') return JSON.parse(text.slice(start, at)); }
    reject('INTEGRITY_JSON');
  }
  function value(depth) {
    if (depth > 64) reject('INTEGRITY_JSON_DEPTH');
    whitespace();
    if (text[at] === '{') {
      at++; whitespace(); const seen = new Set();
      if (text[at] === '}') { at++; return; }
      for (;;) {
        if (text[at] !== '"') reject('INTEGRITY_JSON');
        const name = string(); if (seen.has(name) || ['__proto__', 'prototype', 'constructor'].includes(name)) reject('INTEGRITY_DUPLICATE_FIELD');
        seen.add(name); whitespace(); if (text[at++] !== ':') reject('INTEGRITY_JSON'); value(depth + 1); whitespace();
        if (text[at] === '}') { at++; return; } if (text[at++] !== ',') reject('INTEGRITY_JSON'); whitespace();
      }
    }
    if (text[at] === '[') {
      at++; whitespace(); if (text[at] === ']') { at++; return; }
      for (;;) { value(depth + 1); whitespace(); if (text[at] === ']') { at++; return; } if (text[at++] !== ',') reject('INTEGRITY_JSON'); }
    }
    if (text[at] === '"') { string(); return; }
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(at));
    if (!match) reject('INTEGRITY_JSON'); at += match[0].length;
  }
  try { value(0); whitespace(); if (at !== text.length) reject('INTEGRITY_JSON'); return JSON.parse(text); }
  catch (error) { if (error.code) throw error; reject('INTEGRITY_JSON'); }
}
function plain(file) {
  const full = path.resolve(file);
  for (let p = full; ; p = path.dirname(p)) {
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) reject('INTEGRITY_REPARSE');
    if (p === path.dirname(p)) break;
  }
  return full;
}
function readJson(file) { return parseStrict(fs.readFileSync(plain(file), 'utf8')); }
function fileRow(file, name = path.basename(file)) { const bytes = fs.readFileSync(plain(file)); return { file: name, size: bytes.length, sha256: sha(bytes) }; }
function row(r) { keys(r, ['file', 'size', 'sha256']); if (typeof r.file !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(r.file) || !Number.isSafeInteger(r.size) || r.size < 1) reject('INTEGRITY_FILE_ROW'); hash(r.sha256); }
function equalRow(actual, expected, code) {
  row(actual); row(expected);
  if (actual.file !== expected.file || actual.size !== expected.size || actual.sha256 !== expected.sha256) reject(code);
}
function verifyFile(file, expected) {
  row(expected); const actual = fileRow(file, expected.file);
  // PS5.1 Hashtable member order is not part of the file identity.
  equalRow(actual, expected, 'INTEGRITY_FILE_BYTES');
}
function writeNew(file, data) {
  const p = plain(file); const bytes = Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8');
  const fd = fs.openSync(p, 'wx'); try { if (fs.writeSync(fd, bytes) !== bytes.length) reject('AUDIT_INPUT_WRITE'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return sha(bytes);
}
function output(file) {
  const permitted = path.resolve(__dirname, '../../../../outputs/engineering-win10-entry-20261007-r1');
  const p = plain(file); const rel = path.relative(permitted, p);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) reject('SCOPE_OUTPUT');
  if (!fs.existsSync(path.dirname(p))) reject('SCOPE_OUTPUT_PARENT');
  return p;
}
function root(v) {
  if (typeof v !== 'string' || !/^C:\\Users\\a9builder\.WIN-2JQ66JE4HTQ\\AppData\\Local\\A9-Engineering-Win10-Entry-[0-9]{8}-R[1-9][0-9]?$/.test(v)) reject('SCOPE_ROOT');
}
function validateComponent(c, name) {
  keys(c, ['component_id', 'legacy_source_binding', 'source_snapshot', 'artifact', 'build_record', 'build_approval', 'profile', 'api_profile', 'legacy_build', 'legacy_approval', 'build_bytes', 'approval_bytes']);
  if (c.component_id !== name) reject('INTEGRITY_COMPONENT_ID'); source(c.legacy_source_binding);
  row(c.source_snapshot); row(c.build_record); row(c.build_approval);
  for (const [data, file, parsed] of [[c.build_bytes, c.build_record, c.legacy_build], [c.approval_bytes, c.build_approval, c.legacy_approval]]) {
    if (typeof data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) reject('INTEGRITY_COMPONENT_RECORD');
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length !== file.size || sha(bytes) !== file.sha256) reject('INTEGRITY_COMPONENT_RECORD');
    equal(parseStrict(bytes.toString('utf8')), parsed, 'INTEGRITY_COMPONENT_RECORD_CONTENT');
  }
  keys(c.artifact, ['file', 'size', 'sha256', 'mvid']); row({ file: c.artifact.file, size: c.artifact.size, sha256: c.artifact.sha256 });
  if (typeof c.artifact.mvid !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(c.artifact.mvid)) reject('INTEGRITY_MVID');
  const b = c.legacy_build;
  if (name === 'capture') {
    if (b.status !== 'CAPTURE_BUILD_PASS' || b.source !== c.legacy_source_binding || b.source_input.sha256 !== c.source_snapshot.sha256 || b.source_input.size !== c.source_snapshot.size || b.scope_approval_sha256 !== c.build_approval.sha256 || b.compiler_exit_code !== 0 || b.runtime_profile !== c.profile || b.api_profile !== c.api_profile || b.assembly.sha256 !== c.artifact.sha256 || b.assembly.size !== c.artifact.size || b.assembly.module_version_id !== c.artifact.mvid) reject('INTEGRITY_CAPTURE_BUILD');
    if (c.legacy_approval.source !== c.legacy_source_binding || c.legacy_approval.status !== 'OWNER_APPROVED_EXACT_PRODUCT_R3_WIN10_SCOPE' || c.legacy_approval.response !== '批准' || c.legacy_approval.decision !== 'ADR-0187') reject('INTEGRITY_COMPONENT_APPROVAL');
  } else {
    if (b.status !== 'OBSERVER_BUILD_AND_PROOF_SELF_TEST_PASS' || b.exit_code !== 0 || b.source_sha256 !== c.source_snapshot.sha256 || b.dll_sha256 !== c.artifact.sha256 || b.dll_size !== c.artifact.size || b.mvid !== c.artifact.mvid || b.pin_sha256 !== c.build_approval.sha256 || c.legacy_approval.source !== c.legacy_source_binding) reject('INTEGRITY_OBSERVER_BUILD');
  }
}
function validateLocalStatic(b) {
  keys(b, ['schema_version', 'status', 'product_identity', 'tool_identity', 'components', 'deployment', 'policy', 'compatibility', 'approval']);
  if (b.schema_version !== 2 || b.status !== 'LOCAL_INPUTS_NOT_WIN10_ADMISSION') reject('INTEGRITY_SCHEMA');
  keys(b.product_identity, ['source', 'zip', 'manifest', 'lock', 'helper', 'electron_exe', 'runtime']);
  source(b.product_identity.source); row(b.product_identity.zip);
  for (const k of ['manifest', 'lock', 'helper', 'electron_exe']) hash(b.product_identity[k]);
  equal(b.product_identity.runtime, { electron: '22.3.27', node: '16.17.1', abi: '110' }, 'INTEGRITY_RUNTIME');
  keys(b.tool_identity, ['version', 'source_head', 'files', 'files_digest']);
  if (b.tool_identity.version !== 'engineering-02-v1') reject('INTEGRITY_TOOL_VERSION'); source(b.tool_identity.source_head); hash(b.tool_identity.files_digest);
  if (!Array.isArray(b.tool_identity.files) || b.tool_identity.files.length !== FILES.length) reject('INTEGRITY_TOOL_CLOSURE');
  const names = b.tool_identity.files.map(r => { row(r); return r.file; });
  equal([...names].sort(), [...FILES].sort(), 'INTEGRITY_TOOL_CLOSURE');
  if (sha(Buffer.from(b.tool_identity.files.map(r => `${r.file}:${r.size}:${r.sha256}\n`).sort().join(''))) !== b.tool_identity.files_digest) reject('INTEGRITY_TOOL_DIGEST');
  keys(b.components, ['capture', 'observer']); for (const n of ['capture', 'observer']) validateComponent(b.components[n], n);
  keys(b.deployment, ['root', 'product_root', 'host_root', 'observer_root']); root(b.deployment.root);
  for (const [k, suffix] of [['product_root', 'package'], ['host_root', 'host'], ['observer_root', 'evidence\\observer-components\\v1']]) if (b.deployment[k] !== b.deployment.root + '\\' + suffix) reject('INTEGRITY_DEPLOYMENT');
  equal(b.policy, POLICY, 'INTEGRITY_POLICY'); equal(b.approval, APPROVAL, 'SCOPE_APPROVAL');
  keys(b.compatibility, ['master', 'manifest_contract']);
  const m = b.compatibility.master;
  // This canonical-object digest complements the original byte digest checked at
  // generation. Keep the entire historical contract intact, including fields
  // that the current replay does not consume. Product source is projected later.
  if (sha(Buffer.from(JSON.stringify(m))) !== 'aa5cae8ed2df92dcc580c82f96e9073e6a3b2ea43ae4a629c927e94c55a6fceb') reject('INTEGRITY_REFERENCE_CONTRACT');
  keys(m, ['schema_version', 'status', 'source', 'root', 'product_root', 'host_root', 'reused_input_root', 'zip', 'manifest', 'lock', 'helper', 'electron_exe', 'inputs', 'scripts', 'host_files', 'phases', 'request_limit', 'validity_minutes', 'scope_contract_sha256', 'approval_evidence_sha256', 'initial_driver_sha256', 'capture_library', 'sync_contract', 'manifest_observer']);
  if (!m || m.zip !== b.product_identity.zip.sha256 || m.manifest !== b.product_identity.manifest || m.lock !== b.product_identity.lock || m.helper !== b.product_identity.helper || m.electron_exe !== b.product_identity.electron_exe || m.capture_library.sha256 !== b.components.capture.artifact.sha256 || m.capture_library.build_sha256 !== b.components.capture.build_record.sha256 || m.manifest_observer.exe.sha256 !== b.components.observer.artifact.sha256 || m.manifest_observer.pin_sha256 !== b.components.observer.build_approval.sha256) reject('INTEGRITY_COMPATIBILITY');
  equal(b.compatibility.manifest_contract, { status: 'A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE', external_acceptance_eligible: false, files: 784 }, 'INTEGRITY_PRODUCT_CONTRACT');
  if (m.schema_version !== 1 || m.status !== 'OWNER_APPROVED_EXACT_PRODUCT_R3_WIN10_SCOPE' || m.request_limit !== POLICY.request_limit || m.validity_minutes !== POLICY.validity_minutes) reject('INTEGRITY_LEGACY_CONTRACT');
  equal(m.phases, PHASES, 'INTEGRITY_PHASES');
  const sync = m.sync_contract;
  keys(sync, ['schema_version', 'runtime_profile', 'call_module', 'cmd', 'argv', 'timeout_ms', 'max_receipts', 'receipt_limit_bytes', 'total_limit_bytes', 'wait_limit_ms', 'timestamp_precision_ms', 'driver_safety_sha256', 'clock_profile', 'clock_frequency', 'snapshot_margin_ns']);
  equal(sync.argv, ['/d', '/c', 'ver'], 'INTEGRITY_SYNC_INVOCATION');
  if (sync.schema_version !== 1 || sync.runtime_profile !== 'WIN10_ELECTRON22_NODE16_SYNC_READONLY_PROBE_RECEIPT_V1_TEST_ONLY' || sync.timeout_ms !== 5000 || sync.wait_limit_ms !== 250 || sync.max_receipts !== 128 || sync.receipt_limit_bytes !== 16384 || sync.total_limit_bytes !== 2097152 || sync.timestamp_precision_ms !== 16 || sync.clock_profile !== POLICY.sync_clock || sync.clock_frequency !== '10000000' || String(sync.snapshot_margin_ns) !== POLICY.snapshot_margin_ns) reject('INTEGRITY_SYNC_CONTRACT');
  const manifest = m.manifest_observer.contract;
  if (manifest.tolerance_ticks !== 160000 || manifest.epoch_ticks !== 504911232000000000 || manifest.wait_limit_ms !== 5000 || manifest.max_events !== 4096 || manifest.max_bytes !== 8388608 || manifest.hard_budget_ms !== 750000 || manifest.stop_grace_ms !== 30000 || manifest.proof_kind !== 'MANIFEST_CONHOST_INSTANCE_EXIT_V1') reject('INTEGRITY_MANIFEST_POLICY');
  const cap = b.components.capture;
  const ob = b.components.observer;
  if (cap.build_approval.sha256 !== m.capture_library.build_approval_sha256 || cap.source_snapshot.sha256 !== m.capture_library.source_sha256 || cap.legacy_build.compiler.sha256 !== m.capture_library.compiler_sha256 || cap.legacy_build.utc_clock.sha256 !== m.capture_library.utc_clock.sha256 || cap.profile !== m.capture_library.runtime_profile || cap.api_profile !== m.capture_library.api_profile || ob.source_snapshot.sha256 !== m.manifest_observer.source.sha256 || ob.artifact.mvid !== m.manifest_observer.exe.mvid || cap.artifact.mvid !== m.capture_library.module_version_id) reject('INTEGRITY_COMPONENT_CLOSURE');
  const references = cap.legacy_build.references;
  if (!Array.isArray(references) || references.length !== 3) reject('INTEGRITY_COMPONENT_REFERENCES');
  const expectedRefs = { 'mscorlib.dll': 'cbba0b14d43901ff3d92cc44efe6a79149bfcaa3006c08ca05e186b2a75b54b5', 'System.dll': 'af12577769e3b0c94fc8e4715cdfd21cbcf0f665bf63489f81e5a0934c94c7e4', 'System.Core.dll': '78c77c7250b6e318e69c1162980640bf7da5e8d3303d3abcc32401a52d667139' };
  if (new Set(references.map(r => r.file)).size !== 3 || references.some(r => { row(r); return expectedRefs[r.file] !== r.sha256; })) reject('INTEGRITY_COMPONENT_REFERENCES');
  if (cap.legacy_build.compiler.sha256 !== 'aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116' || cap.legacy_build.compiler.signature_status !== 'Valid' || cap.legacy_build.compiler.path !== 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe' || typeof cap.legacy_build.arguments !== 'string') reject('INTEGRITY_COMPONENT_COMPILER');
  return b;
}
function localLegacyMaster(b) {
  validateStatic(b); const m = JSON.parse(JSON.stringify(b.compatibility.master));
  m.status = 'LOCAL_ENGINEERING_MASTER_NOT_ADMITTED'; m.source = b.product_identity.source;
  m.root = b.deployment.root; m.product_root = b.deployment.product_root; m.host_root = b.deployment.host_root; m.reused_input_root = b.deployment.root + '\\inputs';
  m.manifest_observer.component_dir = b.deployment.observer_root;
  m.scripts = b.tool_identity.files.filter(r => ['stage-product.ps1', 'launch-product-desktop.ps1', 'serve-product-desktop.ps1'].includes(r.file));
  m.initial_driver_sha256 = b.tool_identity.files.find(r => r.file === 'product-driver.cjs').sha256;
  return m;
}
function createRevision(b, bindingHash, label) {
  validateStatic(b); hash(bindingHash);
  if (!['controlled-boot', 'normal-short', 'normal-full', 'ready-negative'].includes(label)) reject('INTEGRITY_REVISION_LABEL');
  const m = legacyMaster(b); const r = {};
  for (const key of ['source', 'root', 'product_root', 'host_root', 'zip', 'manifest', 'lock', 'helper', 'electron_exe', 'phases', 'request_limit', 'validity_minutes', 'scope_contract_sha256', 'approval_evidence_sha256', 'capture_library', 'sync_contract', 'manifest_observer']) r[key] = m[key];
  const scripts = b.tool_identity.files.filter(r => ['stage-product.ps1', 'launch-product-desktop.ps1', 'serve-product-desktop.ps1', 'product-driver.cjs'].includes(r.file));
  Object.assign(r, { schema_version: 1, status: b.schema_version === 3 ? 'CURRENT_SCOPED_ENGINEERING_REVISION' : 'LOCAL_ENGINEERING_REVISION_NOT_ADMITTED', master_sha256: bindingHash, scripts, scripts_digest: sha(Buffer.from(scripts.map(r => `${r.file}:${r.sha256}:${r.size}\n`).sort().join(''))) });
  return { schema_version: b.schema_version, kind: 'revision', status: b.schema_version === 3 ? 'WIN10_REVISION_NOT_ADMISSION' : 'LOCAL_REVISION_NOT_WIN10_ADMISSION', binding_sha256: bindingHash, label, source_digest: b.tool_identity.files_digest, compatibility: { revision: r } };
}
function unwrapRevision(wrapper, b, bindingHash) {
  keys(wrapper, ['schema_version', 'kind', 'status', 'binding_sha256', 'label', 'source_digest', 'compatibility']);
  equal(wrapper, createRevision(b, bindingHash, wrapper.label), 'INTEGRITY_REVISION_BINDING');
  return wrapper.compatibility.revision;
}
function verifyStaticFiles(b, toolRoot = __dirname) { validateStatic(b); for (const r of b.tool_identity.files) verifyFile(path.join(toolRoot, r.file), r); return b; }
function loadStatic(file, expectedHash, toolRoot = __dirname) { hash(expectedHash); const bytes = fs.readFileSync(plain(file)); if (sha(bytes) !== expectedHash) reject('INTEGRITY_BINDING_HASH'); const b = readJson(file); if (b.schema_version === 3 && !bytes.equals(Buffer.from(JSON.stringify(b, null, 2) + '\n'))) reject('INTEGRITY_CANONICAL_BINDING'); return verifyStaticFiles(b, toolRoot); }
function createStatic(reference, productDirectory, deploymentRoot, sourceHead, toolRoot = __dirname) {
  root(deploymentRoot); source(sourceHead);
  const masterFile = path.join(reference, 'frozen-control/master-pin.json');
  if (sha(fs.readFileSync(plain(masterFile))) !== 'fb4adc2b0bd53b8b1dd4e124e2d9a97e37e9ec1d573c25b48504e54adc22366f') reject('INTEGRITY_REFERENCE_MASTER');
  const m = readJson(masterFile);
  const product = readJson(path.join(productDirectory, 'package-identity.json'));
  if (product.source !== '8d207ab11d2c8134a81e4e62900f395aae99944e' || product.zip.sha256 !== 'e96fdf9678ffede770704fa68cfd39ea7ac6bf42ba0c3dd5fd400aa7dd7cd1a0' || product.manifest_sha256 !== 'd084907ce7d488f0bf98984b49fe09b6e6d5c86b0c9786db46a33c40e62eda1c') reject('SCOPE_R4_PRODUCT');
  const zip = fileRow(path.join(productDirectory, 'package', product.zip.file)); equal(zip, { file: product.zip.file, size: product.zip.size, sha256: product.zip.sha256 }, 'INTEGRITY_PRODUCT_ZIP');
  const capture = readJson(path.join(reference, 'capture-built/capture-build.json'));
  const capApproval = readJson(path.join(reference, 'capture-built/capture-build-scope-approval.json'));
  const obs = readJson(path.join(reference, 'observer-v1-build.stdout'));
  const obsPin = readJson(path.join(reference, 'observer-components/v1/pin.json'));
  const files = FILES.map(n => fileRow(path.join(toolRoot, n)));
  const component = (id, legacy, src, artifact, buildFile, build, approvalFile, approval, profile, api) => ({ component_id: id, legacy_source_binding: legacy, source_snapshot: fileRow(src), artifact, build_record: fileRow(buildFile), build_approval: fileRow(approvalFile), profile, api_profile: api, legacy_build: build, legacy_approval: approval, build_bytes: fs.readFileSync(buildFile).toString('base64'), approval_bytes: fs.readFileSync(approvalFile).toString('base64') });
  const b = {
    schema_version: 2, status: 'LOCAL_INPUTS_NOT_WIN10_ADMISSION',
    product_identity: { source: product.source, zip, manifest: product.manifest_sha256, lock: product.lock_sha256, helper: m.helper, electron_exe: m.electron_exe, runtime: { electron: '22.3.27', node: '16.17.1', abi: '110' } },
    tool_identity: { version: 'engineering-02-v1', source_head: sourceHead, files, files_digest: sha(Buffer.from(files.map(r => `${r.file}:${r.size}:${r.sha256}\n`).sort().join(''))) },
    components: {
      capture: component('capture', capture.source, path.join(reference, 'capture-built/capture-source.cs'), { file: capture.assembly.file, size: capture.assembly.size, sha256: capture.assembly.sha256, mvid: capture.assembly.module_version_id }, path.join(reference, 'capture-built/capture-build.json'), capture, path.join(reference, 'capture-built/capture-build-scope-approval.json'), capApproval, capture.runtime_profile, capture.api_profile),
      observer: component('observer', obsPin.source, path.join(reference, 'event-sources/manifest-process-observer.cs'), { file: 'manifest-process-observer.exe', size: obs.dll_size, sha256: obs.dll_sha256, mvid: obs.mvid }, path.join(reference, 'observer-v1-build.stdout'), obs, path.join(reference, 'observer-components/v1/pin.json'), obsPin, 'WIN10_TEST_ONLY_NOT_PRODUCT_NOT_WIN7_EVIDENCE', 'MANIFEST_CONHOST_INSTANCE_EXIT_V1')
    },
    deployment: { root: deploymentRoot, product_root: deploymentRoot + '\\package', host_root: deploymentRoot + '\\host', observer_root: deploymentRoot + '\\evidence\\observer-components\\v1' },
    policy: JSON.parse(JSON.stringify(POLICY)), compatibility: { master: m, manifest_contract: { status: 'A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE', external_acceptance_eligible: false, files: 784 } }, approval: { ...APPROVAL }
  };
  verifyFile(path.join(reference, 'capture-built/capture-library.dll'), { file: capture.assembly.file, size: capture.assembly.size, sha256: capture.assembly.sha256 });
  return validateStatic(b);
}
function parent(p) { keys(p, ['pid', 'creation_ticks', 'session']); if (!Number.isInteger(p.pid) || p.pid < 1 || !Number.isInteger(p.session) || p.session < 0) reject('LIFECYCLE_PARENT'); ticks(p.creation_ticks); }
function currentIdentity(i, p, scope, currentSession = 3) {
  keys(i, ['Sid', 'User', 'IntegritySid', 'Pid', 'Session', 'Rid', 'ElevationType', 'Elevated', 'Ordinary', 'InJob']);
  if (i.Pid !== p.pid || i.Session !== p.session || typeof i.User !== 'string' || !i.User.startsWith('WIN-2JQ66JE4HTQ\\') || ![i.Elevated, i.Ordinary, i.InJob].every(v => typeof v === 'boolean')) reject('IDENTITY_INSTANCE');
  if (scope === 'ORDINARY_PRODUCT') {
    if (!Number.isInteger(currentSession) || currentSession < 1 || i.Sid !== 'S-1-5-21-3031939772-989444280-3099258187-1005' || i.Session !== currentSession || i.Rid !== 8192 || i.IntegritySid !== 'S-1-16-8192' || i.Elevated || !i.Ordinary || i.InJob || ![1, 3].includes(i.ElevationType)) reject('IDENTITY_ORDINARY_DESKTOP_REQUIRED');
  } else if (scope === 'ADMIN_TOOL_ADMISSION') {
    if (i.Sid !== 'S-1-5-21-3031939772-989444280-3099258187-500' || i.Session !== 0 || i.Rid !== 12288 || i.IntegritySid !== 'S-1-16-12288' || !i.Elevated || i.Ordinary || i.ElevationType !== 1) reject('IDENTITY_PREPARATION_REQUIRED');
  } else reject('SCOPE_IDENTITY');
}
function validateReceipt(r, b, context) {
  keys(r, ['schema_version', 'proof_kind', 'runtime_profile', 'receipt_id', 'request_id', 'master_sha256', 'revision_sha256', 'source', 'parent', 'call_module', 'cmd', 'argv', 'options', 'started_utc_ms', 'returned_utc_ms', 'started_monotonic_ns', 'returned_monotonic_ns', 'timestamp_precision_ms', 'result', 'outputs']);
  if (r.schema_version !== 1 || r.proof_kind !== 'SYNC_READONLY_PROBE_RESULT' || r.source !== b.product_identity.source || r.master_sha256 !== context.master_sha256 || r.revision_sha256 !== context.revision_sha256 || r.request_id !== context.request_id) reject('LIFECYCLE_RECEIPT_BINDING');
  identifier(r.receipt_id); parent(r.parent); equal(r.parent, context.parent, 'LIFECYCLE_SYNC_RECEIPT_PARENT_NOT_PINNED');
  const c = legacyMaster(b).sync_contract;
  if (r.runtime_profile !== c.runtime_profile || r.timestamp_precision_ms !== c.timestamp_precision_ms) reject('INTEGRITY_SYNC_CONTRACT');
  for (const k of ['cmd', 'argv', 'call_module']) equal(r[k], c[k], 'INTEGRITY_SYNC_INVOCATION');
  equal(r.options, { shell: false, windowsHide: true, timeout_ms: 5000, encoding: 'utf8' }, 'INTEGRITY_SYNC_OPTIONS');
  keys(r.result, ['pid', 'status', 'signal', 'error']); if (!Number.isInteger(r.result.pid) || r.result.pid < 1 || r.result.status !== 0 || r.result.signal !== null || r.result.error !== null) reject('LIFECYCLE_SYNC_RESULT');
  if (![r.started_utc_ms, r.returned_utc_ms].every(v => Number.isSafeInteger(v) && v > 0) || r.returned_utc_ms < r.started_utc_ms || ![r.started_monotonic_ns, r.returned_monotonic_ns].every(v => typeof v === 'string' && /^[0-9]{1,22}$/.test(v)) || BigInt(r.returned_monotonic_ns) < BigInt(r.started_monotonic_ns) || Math.abs(r.returned_utc_ms - r.started_utc_ms - Number(BigInt(r.returned_monotonic_ns) - BigInt(r.started_monotonic_ns)) / 1e6) > 32) reject('LIFECYCLE_SYNC_CLOCK');
  keys(r.outputs, ['stdout_bytes', 'stderr_bytes', 'summary']); if (![r.outputs.stdout_bytes, r.outputs.stderr_bytes].every(v => Number.isSafeInteger(v) && v >= 0) || r.outputs.summary !== '[output omitted; UTF8 returned-text byte counts only; raw bytes UNKNOWN]') reject('INTEGRITY_SYNC_OUTPUT');
  return r;
}
function createRuntime(b, receipt, context, freshRunId, usedRunIds) {
  validateStatic(b); keys(context, ['root', 'request_id', 'master_sha256', 'revision_sha256', 'parent', 'identity', 'identity_scope', ...(b.schema_version === 3 ? ['tool_digest', 'execution_scope_sha256'] : [])]);
  identifier(context.request_id); identifier(freshRunId); hash(context.master_sha256); hash(context.revision_sha256); parent(context.parent);
  if (context.root !== b.deployment.root) reject('SCOPE_CURRENT_ROOT');
  currentIdentity(context.identity, context.parent, context.identity_scope, b.schema_version === 3 ? context.parent.session : 3);
  if (b.schema_version === 3 && (context.tool_digest !== b.tool_identity.files_digest || context.execution_scope_sha256 !== scopeDigest(b))) reject('INTEGRITY_CURRENT_SCOPE');
  if (b.schema_version === 3) {
    const bindingHash = sha(Buffer.from(JSON.stringify(b, null, 2) + '\n'));
    const revisions = ['controlled-boot', 'normal-short', 'normal-full', 'ready-negative'].map(label => sha(Buffer.from(JSON.stringify(createRevision(b, bindingHash, label), null, 2) + '\n')));
    if (context.master_sha256 !== bindingHash || !revisions.includes(context.revision_sha256) || context.request_id !== freshRunId) reject('LIFECYCLE_CURRENT_INPUT_BINDING');
    if (!Number.isSafeInteger(receipt.returned_utc_ms) || receipt.returned_utc_ms > Date.now() || Date.now() - receipt.returned_utc_ms > 5000) reject('LIFECYCLE_CURRENT_RECEIPT_EXPIRED');
  }
  if (!Array.isArray(usedRunIds) || usedRunIds.some(x => typeof x !== 'string' || !/^[a-f0-9]{32}$/.test(x)) || usedRunIds.includes(freshRunId)) reject('OLD_PROBE_RUN');
  validateReceipt(receipt, b, context);
  return { schema_version: b.schema_version, ...(b.schema_version === 3 ? { kind: 'current-run' } : {}), status: b.schema_version === 3 ? 'CURRENT_RUNTIME_NOT_PRODUCT_PASS' : 'LOCAL_RUNTIME_REPLAY_NOT_PRODUCT', run_id: freshRunId, root: context.root, source: b.product_identity.source, context, receipt, receipt_sha256: sha(Buffer.from(JSON.stringify(receipt))), manifest_parameters: { PinSha256: context.master_sha256, AdmitRequestId: context.request_id, AdmitLabel: 'current', ComponentVersion: b.schema_version === 3 ? (forensic(b) ? 'v3' : 'v2') : 'v1', Tag: freshRunId } };
}
function verifyRuntime(r, b, currentContext) {
  keys(r, ['schema_version', 'status', 'run_id', 'root', 'source', 'context', 'receipt', 'receipt_sha256', 'manifest_parameters', ...(b.schema_version === 3 ? ['kind'] : [])]);
  const expected = createRuntime(b, r.receipt, currentContext, r.run_id, []); equal(r, expected, 'LIFECYCLE_CURRENT_RUNTIME_BINDING'); return r;
}
const WIN10_ROOT = 'C:\\Users\\a9builder.WIN-2JQ66JE4HTQ\\AppData\\Local\\A9-Engineering-Win10-Entry-20261007-R2';
const CURRENT_APPROVAL = Object.freeze({ task_sha256: 'c0889767c9d7bfb7dd60198e7caf750170a7b861e40d2f82bb1856f5bba0d231', adr_sha256: 'd53db801510e323826d1e5d6fe4286f9b343a984702f3242beb12e7dfa79347f', decision: 'ADR-0195', response: '批准，能否帮我切换账户' });
const OBSERVER_ROWS = Object.freeze({
  build_record: { file: 'observer-build.json', size: 6131, sha256: '6340915ddf82d96a2ad47dbca759e16454bbad12999e0bcf9a2e67812bcd6e53' },
  build_scope: { file: 'observer-build-scope.json', size: 4486, sha256: '5d265bacf5b4cfb89a555e81a23e5536149392ab909add593e1d96d0fb93c8a0' },
  bootstrap: { file: 'observer-build-input.ps1', size: 6982, sha256: '26491fe527f3edd1ee338d38d8d0fb94a902502f847d860983ea82d2ba57b67d' },
  artifact: { file: 'manifest-process-observer.exe', size: 34304, sha256: '3ae30252c0eefdbd451432ee2e801656f0ffd530237cefde3194ffa7572651b6', mvid: '77def7b9-02e7-422d-a84c-81905df62b8c' }
});
const ADMISSION_CASES = Object.freeze(['ps51-parse', 'node16-cli', 'physical-closure', 'request-revision', 'capture-probe', 'observer-etw', 'cross-account-access']);
const FORENSIC_FILES = Object.freeze([...FILES, 'capture-source.cs', 'manifest-process-observer.cs', 'build-forensic-components.ps1']);
const FORENSIC_ROOT = WIN10_ROOT.replace(/R2$/, 'R3');
const FORENSIC_APPROVAL = Object.freeze({ status: 'OWNER_APPROVED_LOCAL_IMPLEMENTATION_ONLY', decision: 'ADR-0196', response: '批准，并继续A＋r4，先修取证组件', task_section_sha256: '40a9ce940e21da949d730bf55ead96f9bbdd7efa85a4434fa7753cf42bfe7dc7', adr_sha256: '5c52d7cab68bb9cf861a3f3e5ed94897385c49798d76db54799466b8f48b4b42', remote_authorized: false });
const FORENSIC_ORIGINS = Object.freeze({ capture: { file: 'capture-source.cs', size: 19439, sha256: 'dbc85763ce25287adcb4c853e37963755c56d9561f9d06e41f53bfdb78e952cd' }, observer: { file: 'manifest-process-observer.cs', size: 42102, sha256: '218a2ed353acb0338b0c831f58e3233b3a7802465bffca41535cc62ed9571f78' } });
const FORENSIC_DEPENDENCIES = Object.freeze([{"file":"csc.exe","path":"C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe","size":2569696,"sha256":"aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116"},{"file":"mscorlib.dll","path":"C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\mscorlib.dll","size":5445664,"sha256":"cbba0b14d43901ff3d92cc44efe6a79149bfcaa3006c08ca05e186b2a75b54b5"},{"file":"System.dll","path":"C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.dll","size":3541424,"sha256":"af12577769e3b0c94fc8e4715cdfd21cbcf0f665bf63489f81e5a0934c94c7e4"},{"file":"System.Core.dll","path":"C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Core.dll","size":1551312,"sha256":"78c77c7250b6e318e69c1162980640bf7da5e8d3303d3abcc32401a52d667139"},{"file":"advapi32.dll","path":"C:\\Windows\\System32\\advapi32.dll","size":712320,"sha256":"bde5f0e6f36a706a8a2e0fab1b362eea267aa6ee9f18aab1f899f38888c21280"},{"file":"tdh.dll","path":"C:\\Windows\\System32\\tdh.dll","size":1128960,"sha256":"ff70ee258e974fb7b775c14d6f7b1be73aacb83c27f803a9f512776803e93a24"},{"file":"kernel32.dll","path":"C:\\Windows\\System32\\kernel32.dll","size":783720,"sha256":"4636f65d449b1353100578c6cb139933cf2b134f5e246119d18968873a058bed"},{"file":"cmd.exe","path":"C:\\Windows\\System32\\cmd.exe","size":289792,"sha256":"badf4752413cb0cbdc03fb95820ca167f0cdc63b597ccdb5ef43111180e088b0"},{"file":"powershell.exe","path":"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe","size":455680,"sha256":"9785001b0dcf755eddb8af294a373c0b87b2498660f724e76c4d53f9c217c7a3"},{"file":"conhost.exe","path":"C:\\Windows\\System32\\conhost.exe","size":867840,"sha256":"b02ee54fb2ec69673386d41119ee8ed083a6eab3bfca6aa2155d20ce68ef8963"}]);
const V5_ADMISSION = 'engineering-02-v5-admission', V6_PRODUCT = 'engineering-02-v6-product';
const admission = b => [V5_ADMISSION, V6_PRODUCT].includes(b.tool_identity.version);
const forensic = b => ['engineering-02-v3', 'engineering-02-v4', V5_ADMISSION, V6_PRODUCT].includes(b.tool_identity.version);
// ADR-0210: v6 keeps every v5 forensic operation and adds a closed product role set for the shortest chain only.
const product = b => b.tool_identity.version === V6_PRODUCT;
const PRODUCT_ROLES = Object.freeze(['ADMIN_TOOL_ADMISSION', 'ORDINARY_PRODUCT']);
const PRODUCT_SCOPE = Object.freeze({ phases: Object.freeze(['Boot', 'Background']), revision_labels: Object.freeze(['normal-short']), requests: Object.freeze(['SYNC', 'Boot', 'Background']), request_limit: 3 });
const ADMISSION_FILES = Object.freeze([...FORENSIC_FILES, 'forensic-admission.ps1']);
const ADMISSION_ROOT = WIN10_ROOT.replace(/R2$/, 'R4');
const ADMISSION_OPERATIONS = Object.freeze({ ADMIN_FORENSIC_ADMISSION: Object.freeze(['capture-self-query', 'observer-admit', 'canary-admin']), ORDINARY_FORENSIC_ADMISSION: Object.freeze(['ordinary-probe']) });
const PRODUCT_LOCAL_APPROVAL = Object.freeze({ decision: 'ADR-0210', response: '批准 ADR-0210 和 S1 七路径本地实现，选项 A；批准增补两路径，共 9 路径，选项 A', task_section_sha256: '9d5330956c423b956e959f439137c41b762dc6385272c455f43d2287210bdc6b', adr_sha256: '3958e35ec3138923b76bae3639b707b7cb31be24da47c534c4c5dd61e90f42f5', remote_authorized: false });
const ADMISSION_LOCAL_APPROVAL = Object.freeze({ decision: 'ADR-0198', response: '批准', task_section_sha256: '138b59bae0fc3d65206ac352faf84eaab672e5a77668707cc8e022d660432e3a', adr_sha256: '15b15e3b28e82d03e2bedc16b7be0b071f7e4031e0c8b1f37a08e234dd73bf58', remote_authorized: false });
// ADR-0197: these immutable builds used this validator, not the current runtime tools.
const INHERITED_BUILD_VALIDATOR = Object.freeze({ file: 'input-binding.cjs', size: 74590, sha256: '990f13314ec3cf5a88c2572c6787919f734c406bcb333a8e4c888c75f14d71d3' });
const INHERITED_BUILD_ROWS = Object.freeze({
  capture: { build_record: { file: 'capture-build.json', size: 6934, sha256: '4ec18b394df154def0ed035e8e619fbc6b6ff60a6b3e2a0e4c76ca2762f0c5be' }, build_scope: { file: 'capture-build-scope.json', size: 3991, sha256: '7b6e6225a2d1ba7d18e20551123c8d4fa0604af1359827ad5b62d821b0d0a5e8' } },
  observer: { build_record: { file: 'observer-build.json', size: 6991, sha256: 'dc8e24ddd00fa612c7d651ec49c62246184ae4684fa2a051ded015a40d660bfd' }, build_scope: { file: 'observer-build-scope.json', size: 4015, sha256: 'a73c2d3731ae4cb8c2f2c56eba880f9f74278bbd08b627c36448dfb31f47135c' } }
});
const decodeRecord = (data, r) => { if (typeof data !== 'string' || Buffer.from(data, 'base64').toString('base64') !== data) reject('INTEGRITY_COMPONENT_RECORD'); const bytes = Buffer.from(data, 'base64'); if (bytes.length !== r.size || sha(bytes) !== r.sha256) reject('INTEGRITY_COMPONENT_RECORD'); return parseStrict(bytes.toString('utf8')); };
function dependencyLocks(b) { return decodeRecord(b.components.observer.build_bytes, b.components.observer.build_record).dependencies; }
function createForensicScope(previous, component, runId, toolRoot = __dirname) {
  validateWin10Static(previous); if (forensic(previous)) reject('SCOPE_BUILD_REFERENCE'); identifier(runId);
  if (!Object.hasOwn(FORENSIC_ORIGINS, component)) reject('SCOPE_COMPONENT');
  const scope = { schema_version: 1, status: 'LOCAL_PREPARATION_NOT_REMOTE_AUTHORIZATION', component_id: component, machine: 'WIN-2JQ66JE4HTQ', root: FORENSIC_ROOT, build_dir: FORENSIC_ROOT + '\\compile\\' + component + '-' + runId, run_id: runId, source_head: previous.tool_identity.source_head, origin_snapshot: FORENSIC_ORIGINS[component], source_snapshot: fileRow(path.join(toolRoot, FORENSIC_ORIGINS[component].file)), bootstrap: fileRow(path.join(toolRoot, 'build-forensic-components.ps1')), validator: fileRow(path.join(toolRoot, 'input-binding.cjs')), dependencies: dependencyLocks(previous), compile_timeout_ms: 30000, drain_timeout_ms: 1000, local_approval: FORENSIC_APPROVAL, remote_approval: null, product_execution_authorized: false };
  validateForensicScope(scope); return scope;
}
function validateForensicScope(s) {
  keys(s, ['schema_version', 'status', 'component_id', 'machine', 'root', 'build_dir', 'run_id', 'source_head', 'origin_snapshot', 'source_snapshot', 'bootstrap', 'validator', 'dependencies', 'compile_timeout_ms', 'drain_timeout_ms', 'local_approval', 'remote_approval', 'product_execution_authorized']);
  if (s.schema_version !== 1 || !Object.hasOwn(FORENSIC_ORIGINS, s.component_id) || s.machine !== 'WIN-2JQ66JE4HTQ' || s.root !== FORENSIC_ROOT || s.source_head !== 'a53c9b9d861486e5923bc82ea70b31b76af1a939' || s.product_execution_authorized !== false || s.compile_timeout_ms !== 30000 || s.drain_timeout_ms !== 1000) reject('SCOPE_FORENSIC_BUILD');
  identifier(s.run_id); equalRow(s.origin_snapshot, FORENSIC_ORIGINS[s.component_id], 'INTEGRITY_SOURCE_ORIGIN'); row(s.source_snapshot); row(s.bootstrap); row(s.validator);
  if (s.source_snapshot.file !== s.origin_snapshot.file || s.bootstrap.file !== 'build-forensic-components.ps1' || s.validator.file !== 'input-binding.cjs' || s.build_dir !== FORENSIC_ROOT + '\\compile\\' + s.component_id + '-' + s.run_id) reject('SCOPE_BUILD_DIRECTORY');
  equal(s.local_approval, FORENSIC_APPROVAL, 'SCOPE_LOCAL_APPROVAL');
  // The immutable R2 build locks are a read-only dependency source, never a new admission.
  const expected = FORENSIC_DEPENDENCIES;
  equal(s.dependencies, expected, 'INTEGRITY_FORENSIC_DEPENDENCIES');
  if (s.status === 'LOCAL_PREPARATION_NOT_REMOTE_AUTHORIZATION') { if (s.remote_approval !== null) reject('SCOPE_REMOTE_APPROVAL'); }
  else if (s.status === 'OWNER_APPROVED_FORENSIC_BUILD_ONLY') {
    keys(s.remote_approval, ['response', 'review_sha256']); hash(s.remote_approval.review_sha256);
    if (typeof s.remote_approval.response !== 'string' || !s.remote_approval.response.trim()) reject('SCOPE_REMOTE_APPROVAL');
  } else reject('SCOPE_REMOTE_APPROVAL');
  return s;
}
function validateForensicComponent(c, id, toolFiles, version = 'engineering-02-v3') {
  const inherited = ['engineering-02-v4', V5_ADMISSION, V6_PRODUCT].includes(version);
  keys(c, ['component_id', 'legacy_source_binding', 'origin_snapshot', 'tool_source_head', 'source_snapshot', 'artifact', 'build_record', 'build_scope', 'bootstrap', 'profile', 'api_profile', 'build_bytes', 'scope_bytes', ...(inherited ? ['build_provenance'] : [])]);
  if (c.component_id !== id || c.tool_source_head !== 'a53c9b9d861486e5923bc82ea70b31b76af1a939' || c.legacy_source_binding !== '8d207ab11d2c8134a81e4e62900f395aae99944e') reject('INTEGRITY_FORENSIC_COMPONENT');
  equalRow(c.origin_snapshot, FORENSIC_ORIGINS[id], 'INTEGRITY_SOURCE_ORIGIN');
  equalRow(c.source_snapshot, toolFiles.find(r => r.file === c.origin_snapshot.file), 'INTEGRITY_NEW_SOURCE');
  equalRow(c.bootstrap, toolFiles.find(r => r.file === 'build-forensic-components.ps1'), 'INTEGRITY_BUILD_ENTRY');
  keys(c.artifact, ['file', 'size', 'sha256', 'mvid']); row({ file: c.artifact.file, size: c.artifact.size, sha256: c.artifact.sha256 });
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(c.artifact.mvid) || c.artifact.file !== (id === 'capture' ? 'capture-library.dll' : 'manifest-process-observer.exe')) reject('INTEGRITY_MVID');
  const oldSha = id === 'capture' ? '3f45cc66e7f81c7321bdce4b71338614ceae618d9c0636620a0f47b72d880064' : OBSERVER_ROWS.artifact.sha256;
  const oldMvid = id === 'capture' ? 'ba25f945-5351-4b90-8ed8-4c8a5f1cfe08' : OBSERVER_ROWS.artifact.mvid;
  if (c.artifact.sha256 === oldSha || c.artifact.mvid === oldMvid || c.source_snapshot.sha256 === c.origin_snapshot.sha256) reject('INTEGRITY_OLD_COMPONENT_GENERATION');
  row(c.build_record); row(c.build_scope);
  const s = validateForensicScope(decodeRecord(c.scope_bytes, c.build_scope)), b = decodeRecord(c.build_bytes, c.build_record);
  let validator = toolFiles.find(r => r.file === 'input-binding.cjs');
  if (inherited) {
    const p = c.build_provenance;
    keys(p, ['schema_version', 'status', 'validator', 'validator_bytes']); row(p.validator);
    if (p.schema_version !== 1 || p.status !== 'INHERITED_EVIDENCE') reject('INTEGRITY_BUILD_PROVENANCE');
    equalRow(p.validator, INHERITED_BUILD_VALIDATOR, 'INTEGRITY_INHERITED_BUILD_VALIDATOR');
    for (const field of ['build_record', 'build_scope']) equalRow(c[field], INHERITED_BUILD_ROWS[id][field], 'INTEGRITY_INHERITED_BUILD_RECORD');
    if (typeof p.validator_bytes !== 'string') reject('INTEGRITY_INHERITED_BUILD_VALIDATOR_BYTES');
    const bytes = Buffer.from(p.validator_bytes, 'base64');
    if (bytes.toString('base64') !== p.validator_bytes || bytes.length !== p.validator.size || sha(bytes) !== p.validator.sha256) reject('INTEGRITY_INHERITED_BUILD_VALIDATOR_BYTES');
    validator = p.validator;
  }
  keys(b, ['schema_version', 'status', 'build_kind', 'component_id', 'scope_sha256', 'bootstrap_sha256', 'tool_source_head', 'origin_snapshot', 'source_snapshot', 'artifact', 'dependencies', 'arguments', 'compiler_pid', 'compiler_creation_ticks', 'compiler_exit_code', 'started_at', 'finished_at', 'self_test_cases', 'output_rows', 'identity']);
  if (s.status !== 'OWNER_APPROVED_FORENSIC_BUILD_ONLY' || b.schema_version !== 1 || b.status !== 'FORENSIC_BUILD_AND_SELF_TEST_PASS_NOT_ADMISSION' || b.build_kind !== 'INDEPENDENT_ENGINEERING_02_FORENSIC_V3' || b.component_id !== id || s.component_id !== id || b.scope_sha256 !== c.build_scope.sha256 || b.bootstrap_sha256 !== c.bootstrap.sha256 || b.tool_source_head !== c.tool_source_head || b.compiler_exit_code !== 0 || !Number.isInteger(b.compiler_pid) || b.compiler_pid < 1) reject('INTEGRITY_FORENSIC_BUILD');
  ticks(b.compiler_creation_ticks); equalRow(b.source_snapshot, c.source_snapshot, 'INTEGRITY_NEW_SOURCE'); equalRow(b.origin_snapshot, c.origin_snapshot, 'INTEGRITY_SOURCE_ORIGIN'); equal(b.artifact, c.artifact, 'INTEGRITY_NEW_ARTIFACT'); equal(b.dependencies, s.dependencies, 'INTEGRITY_FORENSIC_DEPENDENCIES'); equalRow(s.source_snapshot, c.source_snapshot, 'INTEGRITY_BUILD_SOURCE'); equalRow(s.bootstrap, c.bootstrap, 'INTEGRITY_BUILD_ENTRY'); equalRow(s.validator, validator, 'INTEGRITY_BUILD_VALIDATOR');
  if (b.arguments !== buildArguments(s) || s.source_head !== c.tool_source_head || b.finished_at === 'UNKNOWN' || !Number.isFinite(Date.parse(b.finished_at))) reject('INTEGRITY_BUILD_ARGUMENTS_OR_TIME');
  if (b.self_test_cases !== (id === 'capture' ? 1 : 43) || c.profile !== (id === 'capture' ? 'WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V5_TEST_ONLY' : 'WIN10_TEST_ONLY_NOT_PRODUCT_NOT_WIN7_EVIDENCE') || c.api_profile !== (id === 'capture' ? 'QUERY_LIMITED_INFORMATION_SYNCHRONIZE_SNAPSHOT_PRECISE_UTC_V5' : 'MANIFEST_PROCESS_GENERATIONS_V2_TEST_ONLY')) reject('INTEGRITY_FORENSIC_SELF_TEST');
  if (!Number.isFinite(Date.parse(b.started_at)) || Date.parse(b.finished_at) < Date.parse(b.started_at)) reject('LIFECYCLE_BUILD_TIME');
  currentIdentity(b.identity, { pid: b.identity.Pid, session: 0, creation_ticks: b.compiler_creation_ticks }, 'ADMIN_TOOL_ADMISSION');
  if (!Array.isArray(b.output_rows) || b.output_rows.length !== 2) reject('INTEGRITY_BUILD_OUTPUTS'); b.output_rows.forEach(row);
  return b;
}
function buildArguments(s) {
  const artifact = s.component_id === 'capture' ? 'capture-library.dll' : 'manifest-process-observer.exe';
  return '/nologo /noconfig /nostdlib+ /utf8output /target:' + (s.component_id === 'capture' ? 'library' : 'winexe') + ' /platform:x64 /optimize+ /debug- /out:"' + s.build_dir + '\\' + artifact + '" ' + s.dependencies.filter(x => ['mscorlib.dll', 'System.dll', 'System.Core.dll'].includes(x.file)).map(x => '/reference:"' + x.path + '"').join(' ') + ' "' + s.build_dir + '\\' + s.source_snapshot.file + '"';
}
function createForensicStatic(previous, captureDirectory, observerDirectory, toolRoot = __dirname, buildValidatorFile) {
  validateWin10Static(previous); if (forensic(previous)) reject('SCOPE_BUILD_REFERENCE');
  const b = JSON.parse(JSON.stringify(previous)), files = FORENSIC_FILES.map(n => fileRow(path.join(toolRoot, n)));
  let provenance;
  if (buildValidatorFile !== undefined) {
    const validator = fileRow(buildValidatorFile);
    equalRow(validator, INHERITED_BUILD_VALIDATOR, 'INTEGRITY_INHERITED_BUILD_VALIDATOR');
    provenance = { schema_version: 1, status: 'INHERITED_EVIDENCE', validator, validator_bytes: fs.readFileSync(plain(buildValidatorFile)).toString('base64') };
  }
  b.tool_identity = { ...b.tool_identity, version: provenance ? 'engineering-02-v4' : 'engineering-02-v3', files, files_digest: sha(Buffer.from(files.map(r => `${r.file}:${r.size}:${r.sha256}\n`).sort().join(''))) };
  for (const [id, dir] of [['capture', captureDirectory], ['observer', observerDirectory]]) {
    const buildFile = path.join(dir, id + '-build.json'), scopeFile = path.join(dir, id + '-build-scope.json'), build = readJson(buildFile);
    const c = { component_id: id, legacy_source_binding: previous.components[id].legacy_source_binding, origin_snapshot: FORENSIC_ORIGINS[id], tool_source_head: previous.tool_identity.source_head, source_snapshot: fileRow(path.join(dir, FORENSIC_ORIGINS[id].file)), artifact: build.artifact, build_record: fileRow(buildFile), build_scope: fileRow(scopeFile), bootstrap: fileRow(path.join(dir, 'build-forensic-components.ps1')), profile: id === 'capture' ? 'WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V5_TEST_ONLY' : 'WIN10_TEST_ONLY_NOT_PRODUCT_NOT_WIN7_EVIDENCE', api_profile: id === 'capture' ? 'QUERY_LIMITED_INFORMATION_SYNCHRONIZE_SNAPSHOT_PRECISE_UTC_V5' : 'MANIFEST_PROCESS_GENERATIONS_V2_TEST_ONLY', build_bytes: fs.readFileSync(buildFile).toString('base64'), scope_bytes: fs.readFileSync(scopeFile).toString('base64') };
    if (provenance) c.build_provenance = { ...provenance };
    validateForensicComponent(c, id, files, b.tool_identity.version); verifyFile(path.join(dir, c.artifact.file), { file: c.artifact.file, size: c.artifact.size, sha256: c.artifact.sha256 });
    for (const r of build.output_rows) verifyFile(path.join(dir, r.file), r);
    if (build.arguments !== buildArguments(decodeRecord(c.scope_bytes, c.build_scope))) reject('INTEGRITY_BUILD_ARGUMENTS');
    b.components[id] = c;
  }
  b.deployment = { root: FORENSIC_ROOT, product_root: FORENSIC_ROOT + '\\package', host_root: FORENSIC_ROOT + '\\host', observer_root: FORENSIC_ROOT + '\\evidence\\observer-components\\v3' };
  b.execution_scope = executionScope(b); return validateWin10Static(b);
}

// ADR-0198: preparation never grants a runtime role. A separately approved immutable input is required.
function admissionExecutionScope(b, approved) {
  const v6 = product(b), forensicRoles = Object.keys(ADMISSION_OPERATIONS);
  const value = { schema_version: 2, status: approved ? (v6 ? 'OWNER_APPROVED_EXACT_SHORTEST_PRODUCT_CHAIN' : 'OWNER_APPROVED_EXACT_FORENSIC_ADMISSION_ONLY') : (v6 ? 'LOCAL_PRODUCT_CHAIN_PREPARATION_NOT_REMOTE_AUTHORIZATION' : 'LOCAL_FORENSIC_ADMISSION_PREPARATION_NOT_REMOTE_AUTHORIZATION'), local_approval: v6 ? { ...PRODUCT_LOCAL_APPROVAL } : { ...ADMISSION_LOCAL_APPROVAL }, remote_approval: approved, machine: 'WIN-2JQ66JE4HTQ', root: ADMISSION_ROOT, product_source: b.product_identity.source, zip_sha256: b.product_identity.zip.sha256, tool_digest: b.tool_identity.files_digest, component_digest: componentDigest(b), roles: approved ? (v6 ? [...forensicRoles, ...PRODUCT_ROLES] : forensicRoles) : [], operations: structuredOperations(), product_execution_authorized: v6 && Boolean(approved), ...(v6 ? { product: { phases: [...PRODUCT_SCOPE.phases], revision_labels: [...PRODUCT_SCOPE.revision_labels], requests: [...PRODUCT_SCOPE.requests], request_limit: PRODUCT_SCOPE.request_limit } } : {}) };
  if (approved) {
    keys(approved, ['response', 'review_sha256', 'prepared_binding_sha256', 'approved_at', 'valid_until']); hash(approved.review_sha256); hash(approved.prepared_binding_sha256);
    if (typeof approved.response !== 'string' || !approved.response.trim() || approved.response.length > 2048) reject('SCOPE_ADMISSION_APPROVAL');
    if (!Number.isFinite(Date.parse(approved.approved_at)) || Date.parse(approved.valid_until) - Date.parse(approved.approved_at) !== 7200000) reject('SCOPE_ADMISSION_APPROVAL_WINDOW');
    const prepared = JSON.parse(JSON.stringify(b)); prepared.execution_scope = admissionExecutionScope(prepared, null);
    if (sha(Buffer.from(JSON.stringify(prepared, null, 2) + '\n')) !== approved.prepared_binding_sha256) reject('INTEGRITY_ADMISSION_PREPARATION');
  }
  return value;
}
function structuredOperations() { return Object.fromEntries(Object.entries(ADMISSION_OPERATIONS).map(([k, v]) => [k, [...v]])); }
function createAdmissionStatic(previous, toolRoot = __dirname, version = V5_ADMISSION) {
  validateWin10Static(previous); if (previous.tool_identity.version !== 'engineering-02-v4' || ![V5_ADMISSION, V6_PRODUCT].includes(version)) reject('SCOPE_ADMISSION_REFERENCE');
  const b = JSON.parse(JSON.stringify(previous)), files = ADMISSION_FILES.map(n => fileRow(path.join(toolRoot, n)));
  b.tool_identity = { ...b.tool_identity, version, files, files_digest: sha(Buffer.from(files.map(r => `${r.file}:${r.size}:${r.sha256}\n`).sort().join(''))) };
  b.deployment = { root: ADMISSION_ROOT, product_root: ADMISSION_ROOT + '\\package', host_root: ADMISSION_ROOT + '\\host', observer_root: ADMISSION_ROOT + '\\evidence\\observer-components\\v3' };
  b.execution_scope = admissionExecutionScope(b, null); return validateWin10Static(b);
}
function createProductStatic(previous, toolRoot = __dirname) { return createAdmissionStatic(previous, toolRoot, V6_PRODUCT); }
function approveAdmissionStatic(prepared, approval) {
  validateWin10Static(prepared); if (!admission(prepared) || prepared.execution_scope.remote_approval !== null) reject('SCOPE_ADMISSION_PREPARATION');
  const b = JSON.parse(JSON.stringify(prepared)); b.execution_scope = admissionExecutionScope(b, approval); return validateWin10Static(b);
}
function validateAdmissionOperation(b, role, operation) {
  if (!admission(b) || !Object.hasOwn(ADMISSION_OPERATIONS, role) || !ADMISSION_OPERATIONS[role].includes(operation)) reject('SCOPE_ADMISSION_OPERATION');
}
function validateAdmissionContext(c, b, bindingHash, now = Date.now()) {
  if (!c) reject('INTEGRITY_ADMISSION_CONTEXT');
  keys(c, ['schema_version', 'status', 'evidence_scope', 'machine', 'root', 'binding_sha256', 'execution_scope_sha256', 'tool_digest', 'component_digest', 'source', 'run_id', 'role', 'operation', 'parent', 'identity', 'explorer', 'created_at', 'deadline_at']);
  validateAdmissionOperation(b, c.role, c.operation); hash(c.binding_sha256); identifier(c.run_id); parent(c.parent);
  if (c.schema_version !== 1 || c.status !== 'CURRENT_FORENSIC_CONTEXT_NOT_ADMISSION' || c.evidence_scope !== 'WIN10_DIRECT' || c.machine !== b.execution_scope.machine || c.root !== ADMISSION_ROOT || c.execution_scope_sha256 !== scopeDigest(b) || c.tool_digest !== b.tool_identity.files_digest || c.component_digest !== componentDigest(b) || c.source !== b.product_identity.source || (bindingHash && c.binding_sha256 !== bindingHash)) reject('INTEGRITY_ADMISSION_CONTEXT_BINDING');
  const start = Date.parse(c.created_at), end = Date.parse(c.deadline_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== 180000 || start > now || end <= now || BigInt(c.parent.creation_ticks) > BigInt(Math.trunc(start)) * 10000n + 621355968000000000n) reject('LIFECYCLE_ADMISSION_CONTEXT_TIME');
  currentIdentity(c.identity, c.parent, c.role === 'ORDINARY_FORENSIC_ADMISSION' ? 'ORDINARY_PRODUCT' : 'ADMIN_TOOL_ADMISSION', c.parent.session);
  if (c.role === 'ORDINARY_FORENSIC_ADMISSION') {
    keys(c.explorer, ['parent', 'identity', 'image', 'chain']); parent(c.explorer.parent);
    currentIdentity(c.explorer.identity, c.explorer.parent, 'ORDINARY_PRODUCT', c.parent.session);
    if (c.explorer.image.toLowerCase() !== 'c:\\windows\\explorer.exe' || BigInt(c.explorer.parent.creation_ticks) >= BigInt(c.parent.creation_ticks) || !Array.isArray(c.explorer.chain) || c.explorer.chain.length < 2 || c.explorer.chain.length > 8) reject('IDENTITY_ADMISSION_EXPLORER');
    let last = c.parent;
    for (const row of c.explorer.chain) { keys(row, ['child', 'parent']); equal(row.child, last, 'IDENTITY_ADMISSION_ANCESTOR'); parent(row.parent); if (row.parent.session !== c.parent.session || row.parent.pid === row.child.pid || BigInt(row.parent.creation_ticks) >= BigInt(row.child.creation_ticks)) reject('IDENTITY_ADMISSION_ANCESTOR'); last = row.parent; }
    equal(last, c.explorer.parent, 'IDENTITY_ADMISSION_EXPLORER');
  } else if (c.explorer !== null) reject('IDENTITY_ADMISSION_EXPLORER');
  return c;
}
function admissionContextFile(b, bindingHash, file, digest, now = Date.now()) {
  hash(digest); if (sha(fs.readFileSync(plain(file))) !== digest) reject('INTEGRITY_ADMISSION_CONTEXT_HASH');
  const c = validateAdmissionContext(readJson(file), b, bindingHash, now);
  if (path.resolve(file) !== path.resolve(path.join(b.deployment.root, 'runs', c.run_id, 'current-context.json'))) reject('SCOPE_ADMISSION_CONTEXT_PATH');
  return c;
}
function validateOrdinaryCaptureSet(s, child, parent, lowerTicks, upperTicks) {
  keys(s, ['schema_version', 'raw_added_count', 'root_count', 'console_count', 'gap_count', 'excluded_count', 'instances']);
  if (s.schema_version !== 1 || s.root_count !== 1 || ![0, 1].includes(s.console_count) || s.raw_added_count !== 1 + s.console_count || s.gap_count !== 0 || s.excluded_count !== 0 || !Array.isArray(s.instances) || s.instances.length !== s.raw_added_count || child.capture_added !== s.raw_added_count) reject('INTEGRITY_ORDINARY_CAPTURE_SET');
  const roots = s.instances.filter(i => i.kind === 'powershell');
  if (roots.length !== 1 || new Set(s.instances.map(i => i.pid)).size !== s.instances.length) reject('INTEGRITY_ORDINARY_CAPTURE_ROOT');
  const root = roots[0], match = /^\\device\\harddiskvolume[0-9]+\\windows\\system32\\windowspowershell\\v1\.0\\powershell\.exe$/i;
  if (typeof child.image !== 'string' || !match.test(child.image)) reject('INTEGRITY_ORDINARY_CAPTURE_IMAGE');
  const consoleImage = child.image.slice(0, -'WindowsPowerShell\\v1.0\\powershell.exe'.length) + 'conhost.exe';
  const proofKeys = ['snapshot_started_ticks', 'snapshot_captured_ticks', 'query_ticks', 'creation_ticks', 'parent_creation_ticks', 'session', 'image', 'clock_profile', 'second_observation', 'ownership', 'actual_pid'];
  for (const i of s.instances) {
    keys(i, ['kind', 'pid', 'parent_pid', 'creation_ticks', 'parent_creation_ticks', 'session', 'image', 'proof', 'same_instance', 'exit_code', 'exit_ticks', 'held_query_after_exit']);
    const isRoot = i === root, ancestor = isRoot ? parent : root, image = isRoot ? child.image : consoleImage;
    if (i.kind !== (isRoot ? 'powershell' : 'conhost') || !Number.isInteger(i.pid) || i.pid < 1 || i.pid === parent.pid || i.parent_pid !== ancestor.pid || i.parent_creation_ticks !== ancestor.creation_ticks || i.session !== parent.session || typeof i.image !== 'string' || i.image.toLowerCase() !== image.toLowerCase() || i.same_instance !== true || i.exit_code !== 0 || i.held_query_after_exit !== true) reject('INTEGRITY_ORDINARY_CAPTURE_INSTANCE');
    ticks(i.creation_ticks); ticks(i.parent_creation_ticks); ticks(i.exit_ticks); keys(i.proof, proofKeys); const p = i.proof;
    for (const n of ['snapshot_started_ticks', 'snapshot_captured_ticks', 'query_ticks', 'creation_ticks', 'parent_creation_ticks']) ticks(p[n]);
    if (p.actual_pid !== i.pid || p.creation_ticks !== i.creation_ticks || p.parent_creation_ticks !== i.parent_creation_ticks || p.session !== String(i.session) || typeof p.image !== 'string' || p.image.toLowerCase() !== i.image.toLowerCase() || p.clock_profile !== POLICY.capture_clock || p.second_observation !== 'NOT_REQUIRED' || p.ownership !== 'PROVEN') reject('INTEGRITY_ORDINARY_CAPTURE_PROOF');
    const made = BigInt(i.creation_ticks), start = BigInt(p.snapshot_started_ticks), captured = BigInt(p.snapshot_captured_ticks), query = BigInt(p.query_ticks), ended = BigInt(i.exit_ticks);
    if (made <= BigInt(i.parent_creation_ticks) || made < lowerTicks || start < made || captured < start || query < captured || ended < query || ended > upperTicks || ended > BigInt(root.creation_ticks) + 80000000n) reject('LIFECYCLE_ORDINARY_CAPTURE_TIME');
  }
  for (const n of ['pid', 'creation_ticks', 'session', 'image', 'same_instance', 'exit_code', 'exit_ticks', 'held_query_after_exit']) equal(root[n], child[n], 'INTEGRITY_ORDINARY_CAPTURE_CHILD');
  if (s.instances.filter(i => i.kind === 'conhost').length !== s.console_count) reject('INTEGRITY_ORDINARY_CAPTURE_SET');
  return s;
}
function verifyCapability(r, b, context) {
  if (!admission(b) || !b.execution_scope.remote_approval) reject('SCOPE_ADMISSION_REMOTE_NOT_APPROVED');
  validateAdmissionContext(context, b, undefined, Date.parse(r.finished_at)); keys(r, ['schema_version', 'status', 'evidence_scope', 'binding_sha256', 'execution_scope_sha256', 'tool_digest', 'component_digest', 'source', 'run_id', 'role', 'operation', 'parent', 'started_at', 'finished_at', 'details', 'error']);
  if (r.schema_version !== 1 || r.status !== 'PASS' || r.evidence_scope !== 'WIN10_DIRECT' || r.error !== null) reject('INTEGRITY_CAPABILITY_RESULT');
  for (const n of ['binding_sha256', 'execution_scope_sha256', 'tool_digest', 'component_digest', 'source', 'run_id', 'role', 'operation', 'parent']) equal(r[n], context[n], 'INTEGRITY_CAPABILITY_BINDING');
  const from = Date.parse(r.started_at), to = Date.parse(r.finished_at);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < Date.parse(context.created_at) || to < from || to >= Date.parse(context.deadline_at)) reject('LIFECYCLE_CAPABILITY_TIME');
  const lowerTicks = BigInt(from) * 10000n + 621355968000000000n, upperTicks = BigInt(to + 1) * 10000n + 621355968000000000n;
  const d = r.details;
  if (r.operation === 'capture-self-query') {
    keys(d, ['artifact_sha256', 'mvid', 'pid', 'creation_ticks', 'session', 'image', 'snapshot_count', 'clock_before', 'clock_after', 'access', 'inheritable']);
    if (d.artifact_sha256 !== b.components.capture.artifact.sha256 || d.mvid !== b.components.capture.artifact.mvid || d.pid !== r.parent.pid || d.creation_ticks !== r.parent.creation_ticks || d.session !== r.parent.session || typeof d.image !== 'string' || !/^\\device\\harddiskvolume[0-9]+\\windows\\system32\\windowspowershell\\v1\.0\\powershell\.exe$/i.test(d.image) || !Number.isInteger(d.snapshot_count) || d.snapshot_count < 1 || d.snapshot_count > 32768 || d.access !== 1052672 || d.inheritable !== false) reject('INTEGRITY_QUERY_CAPABILITY');
    ticks(d.clock_before); ticks(d.clock_after); if (BigInt(d.clock_before) < BigInt(d.creation_ticks) || BigInt(d.clock_after) < BigInt(d.clock_before) || BigInt(d.clock_before) < lowerTicks || BigInt(d.clock_after) > upperTicks) reject('LIFECYCLE_CAPABILITY_CLOCK');
  } else if (r.operation === 'observer-admit') {
    keys(d, ['admission']); const a = d.admission, f = a && a.observer_final, c = b.components.observer;
    if (!a || a.status !== 'OBSERVER_ADMISSION_PASS_NOT_PRODUCT_ACCEPTANCE' || a.error !== null || a.cmd_count !== 1 || a.powershell_count !== 1 || a.observer_exit !== 0 || a.exe_sha256 !== c.artifact.sha256 || a.mvid !== c.artifact.mvid || a.build_scope_sha256 !== c.build_scope.sha256 || !f || f.status !== 'OBSERVER_FINAL_CLOSED' || f.request_id !== a.request_id || f.master_sha256 !== r.binding_sha256 || f.events_lost !== 0 || f.log_buffers_lost !== 0 || f.realtime_buffers_lost !== 0 || !Array.isArray(a.proofs) || a.proofs.length !== 2 || !Array.isArray(a.unexpected_descendants) || a.unexpected_descendants.length || a.own_session_absent !== true) reject('INTEGRITY_OBSERVER_CAPABILITY');
    identifier(a.request_id);
    if (a.label !== r.run_id || f.source !== c.legacy_source_binding || f.dispatcher_pid !== r.parent.pid || f.dispatcher_creation_filetime !== (BigInt(r.parent.creation_ticks) - 504911232000000000n).toString() || f.revision_sha256 !== sha(Buffer.from(JSON.stringify(createRevision(b, r.binding_sha256, 'controlled-boot'), null, 2) + '\n')) || f.session_absent !== true || f.consumer_ended !== true || !Array.isArray(f.open_instances) || f.open_instances.length || !/^\\Device\\HarddiskVolume[0-9]+$/.test(f.c_device_mapping)) reject('INTEGRITY_OBSERVER_FINAL_BINDING');
    hash(f.events_sha256);
    if (!Array.isArray(a.roots) || a.roots.length !== 2 || !Array.isArray(a.native_images) || a.native_images.length !== 2) reject('INTEGRITY_OBSERVER_NATIVE_ROOTS');
    for (let i = 0; i < 2; i++) {
      const root = a.roots[i], image = a.native_images[i], proof = a.proofs[i], kind = ['cmd', 'powershell'][i], tail = kind === 'cmd' ? '\\Windows\\System32\\cmd.exe' : '\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      ticks(root.create_ticks); ticks(root.exit_ticks); keys(image, ['kind', 'pid', 'creation_ticks', 'session', 'image', 'normalized', 'held_query_after_exit']);
      if (root.kind !== kind || !Number.isInteger(root.pid) || root.pid < 1 || root.parent !== r.parent.pid || root.session !== 0 || root.exit_code !== 0 || root.stderr_bytes !== 0 || BigInt(root.exit_ticks) < BigInt(root.create_ticks) || root.create_filetime !== (BigInt(root.create_ticks) - 504911232000000000n).toString() || image.kind !== kind || image.pid !== root.pid || image.creation_ticks !== root.create_ticks || image.session !== 0 || typeof image.image !== 'string' || image.image.toLowerCase() !== (f.c_device_mapping + tail).toLowerCase() || image.normalized !== ('c:' + tail).replaceAll('\\', '/').toLowerCase() || image.held_query_after_exit !== true) reject('INTEGRITY_OBSERVER_NATIVE_ROOTS');
      if (!proof || proof.proof_kind !== 'MANIFEST_CONHOST_INSTANCE_EXIT_V1' || proof.parent_pid !== root.pid || proof.parent_kind !== kind || proof.session !== 0 || proof.parent_create_filetime !== root.create_filetime || proof.snapshot_start_filetime !== root.create_filetime || proof.snapshot_captured_filetime !== (BigInt(root.exit_ticks) - 504911232000000000n).toString() || proof.exit_code !== 0 || proof.start_image !== 'c:/windows/system32/conhost.exe' || proof.end_image !== 'conhost.exe' || proof.tolerance_ticks !== 160000) reject('INTEGRITY_OBSERVER_PROOF_BINDING');
      for (const n of ['create_filetime', 'exit_filetime']) if (typeof proof[n] !== 'string' || !/^[1-9][0-9]{17}$/.test(proof[n])) reject('INTEGRITY_OBSERVER_PROOF_TIME');
      const first = BigInt(root.create_filetime), last = BigInt(root.exit_ticks) - 504911232000000000n, made = BigInt(proof.create_filetime), ended = BigInt(proof.exit_filetime);
      if (made < first - 160000n || made > last + 160000n || ended < made || ended > last + 160000n || ![proof.parent_start_seq, proof.start_seq, proof.end_seq].every(Number.isInteger) || proof.parent_start_seq < 1 || proof.parent_start_seq >= proof.start_seq || proof.start_seq >= proof.end_seq) reject('INTEGRITY_OBSERVER_PROOF_TIME');
    }
  } else if (r.operation === 'ordinary-probe') {
    keys(d, ['child', 'capture_set', 'canary']); const c = d.child; keys(c, ['pid', 'creation_ticks', 'session', 'image', 'exit_code', 'exit_ticks', 'same_instance', 'capture_added', 'capture_gaps', 'capture_exclusions', 'output', 'held_query_after_exit']);
    ticks(c.creation_ticks); ticks(c.exit_ticks);
    if (!Number.isInteger(c.pid) || c.pid < 1 || c.pid === r.parent.pid || c.session !== r.parent.session || BigInt(c.creation_ticks) <= BigInt(r.parent.creation_ticks) || BigInt(c.exit_ticks) < BigInt(c.creation_ticks) || BigInt(c.creation_ticks) < lowerTicks || BigInt(c.exit_ticks) > upperTicks || c.exit_code !== 0 || c.same_instance !== true || c.capture_gaps !== 0 || c.capture_exclusions !== 0 || c.output !== 'A9-FORENSIC-OWNED-CHILD' || c.held_query_after_exit !== true || typeof c.image !== 'string' || !/^\\device\\harddiskvolume[0-9]+\\windows\\system32\\windowspowershell\\v1\.0\\powershell\.exe$/i.test(c.image)) reject('INTEGRITY_ORDINARY_QUERY_CAPABILITY');
    validateOrdinaryCaptureSet(d.capture_set, c, r.parent, lowerTicks, upperTicks);
    validateCanary(d.canary, context, true);
  } else { keys(d, ['canary']); validateCanary(d.canary, context); }
  return r;
}
function validateCanary(d, c, ordinaryOnly = false) {
  keys(d, ordinaryOnly ? ['canary_run_id', 'binding_sha256', 'files', 'directions'] : ['canary_run_id', 'binding_sha256', 'files', 'directions', 'ordinary_receipt']); identifier(d.canary_run_id);
  if (!ordinaryOnly) { keys(d.ordinary_receipt, ['run_id', 'context_sha256', 'result_sha256']); identifier(d.ordinary_receipt.run_id); hash(d.ordinary_receipt.context_sha256); hash(d.ordinary_receipt.result_sha256); if (d.ordinary_receipt.run_id === c.run_id) reject('INTEGRITY_CANARY_ORDINARY_INSTANCE'); }
  if (d.binding_sha256 !== c.binding_sha256 || !Array.isArray(d.files) || d.files.length !== 4) reject('INTEGRITY_CANARY_CAPABILITY');
  d.files.forEach(row); if (new Set(d.files.map(r => r.file)).size !== 4 || d.files.some(r => !['admin-a.json', 'admin-b.json', 'ordinary-a.json', 'ordinary-b.json'].includes(r.file))) reject('INTEGRITY_CANARY_CAPABILITY');
  equal(d.directions, (ordinaryOnly ? ['admin-write-user-read', 'user-read-admin-write'] : ['admin-write-user-read', 'user-write-admin-read', 'admin-read-user-write', 'user-read-admin-write']).map(direction => ({ direction, status: 'PASS' })), 'INTEGRITY_CANARY_DIRECTIONS');
}


function verifyCapabilityFiles(r, b, context) {
  verifyCapability(r, b, context);
  if (r.operation === 'observer-admit') {
    const f = r.details.admission.observer_final, file = path.join(b.deployment.observer_root, 'admit-' + r.run_id, 'observer-events.jsonl'), bytes = fs.readFileSync(plain(file));
    if (bytes.length > 8388608 || sha(bytes) !== f.events_sha256 || (bytes.length && bytes[bytes.length - 1] !== 10)) reject('INTEGRITY_CAPABILITY_EVENT_BYTES');
    const audit = verifyObserverGenerations(bytes.length ? bytes.toString('utf8').trimEnd().split('\n').map(parseStrict) : [], { pid: r.parent.pid, create_ft: f.dispatcher_creation_filetime });
    equal(audit.open_instances, f.open_instances, 'LIFECYCLE_CAPABILITY_GENERATIONS');
  } else if (r.operation === 'ordinary-probe' || r.operation === 'canary-admin') {
    const d = r.details.canary, dir = path.join(b.deployment.root, 'runs', d.canary_run_id, 'canary');
    for (const row of d.files) {
      const file = path.join(dir, row.file); verifyFile(file, row); const value = readJson(file);
      keys(value, ['schema_version', 'binding_sha256', 'canary_run_id', 'owner', 'value']);
      if (value.schema_version !== 1 || value.binding_sha256 !== r.binding_sha256 || value.canary_run_id !== d.canary_run_id || value.owner !== (row.file.startsWith('admin-') ? 'Administrator' : 'a9builder') || value.value !== 'A9-' + d.canary_run_id) reject('INTEGRITY_CAPABILITY_CANARY_BYTES');
    }
    if (r.operation === 'canary-admin') {
      const ref = readJson(path.join(dir, 'ordinary-result-reference.json')); equal(ref, d.ordinary_receipt, 'INTEGRITY_CANARY_ORDINARY_REFERENCE');
      const priorDir = path.join(b.deployment.root, 'runs', ref.run_id), file = path.join(priorDir, 'capability-result.json');
      if (sha(fs.readFileSync(plain(file))) !== ref.result_sha256) reject('INTEGRITY_CANARY_ORDINARY_RESULT');
      const prior = readJson(file), c = admissionContextFile(b, r.binding_sha256, path.join(priorDir, 'current-context.json'), ref.context_sha256, Date.parse(prior.finished_at));
      if (prior.operation !== 'ordinary-probe' || prior.role !== 'ORDINARY_FORENSIC_ADMISSION' || !prior.details || !prior.details.canary || prior.details.canary.canary_run_id !== d.canary_run_id) reject('INTEGRITY_CANARY_ORDINARY_REFERENCE');
      verifyCapabilityFiles(prior, b, c); equal(prior.details.canary.files, d.files, 'INTEGRITY_CANARY_CURRENT_FILES');
    }
  }
  return r;
}

// Consumed by the real PS controller before treating a native exclusion as resolved.
// Records prove a relationship only; they never supply an exit or cleanup result.
function validateCaptureExclusion(r, context) {
  keys(context, ['source', 'master_sha256', 'revision_sha256', 'request_id']); source(context.source); hash(context.master_sha256); hash(context.revision_sha256); identifier(context.request_id);
  keys(r, ['schema_version', 'status', 'reason', 'source', 'master_sha256', 'revision_sha256', 'request_id', 'parent', 'child', 'second_parent', 'second_child', 'snapshots', 'query_ticks', 'handle_evidence']);
  if (r.schema_version !== 1 || r.status !== 'RELATIONSHIP_EXCLUDED_NOT_PROCESS_EXIT' || r.reason !== 'CHILD_CREATED_BEFORE_PINNED_PARENT' || r.handle_evidence !== 'RETAINED_BOTH_INSTANCES_TWO_QUERIES') reject('LIFECYCLE_EXCLUSION_KIND');
  for (const k of Object.keys(context)) if (r[k] !== context[k]) reject('INTEGRITY_EXCLUSION_CONTEXT');
  for (const v of [r.parent, r.child, r.second_parent, r.second_child]) {
    keys(v, ['pid', 'creation_ticks', 'session', 'image']); parent({ pid: v.pid, creation_ticks: v.creation_ticks, session: v.session });
    if (typeof v.image !== 'string' || !v.image.startsWith('\\Device\\') || v.image.length > 32768 || /[\x00-\x1f]/.test(v.image)) reject('LIFECYCLE_EXCLUSION_IMAGE');
  }
  equal(r.parent, r.second_parent, 'LIFECYCLE_SECOND_PARENT_INSTANCE'); equal(r.child, r.second_child, 'LIFECYCLE_SECOND_CHILD_INSTANCE');
  if (r.parent.pid === r.child.pid || BigInt(r.child.creation_ticks) >= BigInt(r.parent.creation_ticks)) reject('LIFECYCLE_NOT_PROVEN_NON_CHILD');
  if (!Array.isArray(r.snapshots) || r.snapshots.length !== 2 || !Array.isArray(r.query_ticks) || r.query_ticks.length !== 2) reject('LIFECYCLE_EXCLUSION_OBSERVATIONS');
  let previous = BigInt(r.parent.creation_ticks);
  for (let i = 0; i < 2; i++) {
    const s = r.snapshots[i]; keys(s, ['started_ticks', 'captured_ticks', 'pid', 'parent_pid', 'image', 'clock_profile']); ticks(s.started_ticks); ticks(s.captured_ticks); ticks(r.query_ticks[i]);
    if (s.clock_profile !== POLICY.capture_clock || s.pid !== r.child.pid || s.parent_pid !== r.parent.pid || s.image.toLowerCase() !== r.child.image.split('\\').pop().toLowerCase()) reject('LIFECYCLE_EXCLUSION_SNAPSHOT_BINDING');
    if (BigInt(s.started_ticks) < previous || BigInt(s.captured_ticks) < BigInt(s.started_ticks) || BigInt(r.query_ticks[i]) < BigInt(s.captured_ticks)) reject('LIFECYCLE_EXCLUSION_CLOCK');
    previous = BigInt(r.query_ticks[i]);
  }
  return { status: r.status, process_exit: 'NOT_PROVEN_BY_RELATIONSHIP_EXCLUSION' };
}
// Independent consumer audit of exact instances. Used on closed real ETW logs.
function verifyObserverGenerations(records, dispatcher) {
  keys(dispatcher, ['pid', 'create_ft']); if (!Number.isInteger(dispatcher.pid) || dispatcher.pid < 1) reject('LIFECYCLE_ETW_ROOT');
  const time = v => { if (typeof v !== 'string' || !/^[1-9][0-9]{0,17}$/.test(v)) reject('LIFECYCLE_ETW_TIME'); return BigInt(v); };
  time(dispatcher.create_ft);
  if (!Array.isArray(records) || records.length > 4096) reject('SAFETY_ETW_EVENT_LIMIT');
  const instances = new Map();
  for (let i = 0; i < records.length; i++) {
    const e = records[i]; keys(e, ['seq', 'id', 'version', 'pid', 'parent', 'session', 'image', 'create_ft', 'event_ft', 'exit_ft', 'exit_code', 'schema']);
    if (e.seq !== i + 1 || ![1, 2].includes(e.id) || !Number.isInteger(e.pid) || e.pid < 1 || !Number.isInteger(e.version) || e.version < 0 || e.version > 4) reject('INTEGRITY_ETW_EVENT');
    const startSchema = 'CreateTime:17,ImageName:1,ParentProcessID:8,ProcessID:8,SessionID:8', endSchema = 'CreateTime:17,ExitCode:8,ExitTime:17,ImageName:2,ProcessID:8';
    if (typeof e.image !== 'string' || !e.image || e.image.length > 520 || (e.id === 1 ? e.schema !== startSchema || !Number.isInteger(e.parent) || e.parent < 1 || !Number.isInteger(e.session) || e.session < 0 || e.exit_ft !== null || e.exit_code !== null : ![endSchema, endSchema.replace('ImageName:2', 'ImageName:1')].includes(e.schema) || e.parent !== -1 || e.session !== -1 || !Number.isInteger(e.exit_code))) reject('INTEGRITY_ETW_SCHEMA');
    const key = e.pid + ':' + time(e.create_ft), born = time(e.create_ft), at = time(e.event_ft), instance = instances.get(key);
    if (at < born) reject('LIFECYCLE_ETW_EVENT_CLOCK');
    if (e.id === 1) {
      if (instance) reject('DUPLICATE_START_INSTANCE');
      for (const v of instances.values()) if (v.start.pid === e.pid && (!v.end || time(v.end.exit_ft) > born || time(v.start.create_ft) >= born)) reject('INSTANCE_REUSE_NOT_PROVEN');
      const parents = [...instances.values()].filter(v => v.start.pid === e.parent && time(v.start.create_ft) <= born && (!v.end || time(v.end.exit_ft) >= born));
      const roots = e.parent === dispatcher.pid && born >= time(dispatcher.create_ft) ? 1 : 0;
      if (parents.length + roots !== 1) reject('INSTANCE_PARENT_GENERATION_UNKNOWN_OR_AMBIGUOUS');
      if (parents.length && parents[0].start.session !== e.session) reject('INSTANCE_PARENT_SESSION');
      instances.set(key, { start: e, end: null });
    } else {
      if (!instance) reject('INSTANCE_END_WITHOUT_MATCHING_START'); if (instance.end) reject('DUPLICATE_END_INSTANCE');
      const exit = time(e.exit_ft); if (exit < born || at < exit) reject('LIFECYCLE_ETW_END_CLOCK'); instance.end = e;
    }
  }
  return { status: 'INSTANCE_LOG_VERIFIED_NOT_PROCESS_TREE_PASS', instances: instances.size, open_instances: [...instances.values()].filter(v => !v.end).map(v => ({ pid: v.start.pid, create_ft: v.start.create_ft })) };
}
function scopeDigest(b) { return sha(Buffer.from(JSON.stringify(b.execution_scope))); }
function componentDigest(b) { return sha(Buffer.from(JSON.stringify(['capture', 'observer'].map(n => ({ component: n, artifact: b.components[n].artifact, build: b.components[n].build_record, approval: b.components[n].build_scope || b.components[n].build_approval, ...(['engineering-02-v4', V5_ADMISSION, V6_PRODUCT].includes(b.tool_identity.version) ? { build_provenance: b.components[n].build_provenance } : {}) }))))); }
function executionScope(b) {
  if (admission(b)) return admissionExecutionScope(b, b.execution_scope && b.execution_scope.remote_approval || null);
  if (forensic(b)) return { schema_version: 1, status: 'LOCAL_FORENSIC_REPAIR_REMOTE_NOT_AUTHORIZED', approval: { ...FORENSIC_APPROVAL }, prior_implementation_approval: { ...APPROVAL }, machine: 'WIN-2JQ66JE4HTQ', root: FORENSIC_ROOT, product_source: b.product_identity.source, zip_sha256: b.product_identity.zip.sha256, tool_digest: b.tool_identity.files_digest, component_digest: componentDigest(b), roles: [], session_binding: 'CURRENT_ORDINARY_SESSION', policy: JSON.parse(JSON.stringify(POLICY)) };
  return { schema_version: 1, status: 'CURRENT_WIN10_SCOPE_BOUND', approval: { ...CURRENT_APPROVAL }, prior_implementation_approval: { ...APPROVAL }, machine: 'WIN-2JQ66JE4HTQ', root: WIN10_ROOT, product_source: b.product_identity.source, zip_sha256: b.product_identity.zip.sha256, tool_digest: b.tool_identity.files_digest, component_digest: componentDigest(b), roles: ['ADMIN_TOOL_ADMISSION', 'ORDINARY_PRODUCT'], session_binding: 'CURRENT_ORDINARY_SESSION', policy: JSON.parse(JSON.stringify(POLICY)) };
}
function validateObserverCurrent(c) {
  keys(c, ['component_id', 'legacy_source_binding', 'source_snapshot', 'artifact', 'build_record', 'build_scope', 'bootstrap', 'profile', 'api_profile', 'build_bytes', 'scope_bytes']);
  if (c.component_id !== 'observer' || c.legacy_source_binding !== '8d207ab11d2c8134a81e4e62900f395aae99944e' || c.profile !== 'WIN10_TEST_ONLY_NOT_PRODUCT_NOT_WIN7_EVIDENCE' || c.api_profile !== 'MANIFEST_CONHOST_INSTANCE_EXIT_V1') reject('INTEGRITY_CURRENT_COMPONENT');
  equal(c.source_snapshot, { file: 'manifest-process-observer.cs', size: 42102, sha256: '218a2ed353acb0338b0c831f58e3233b3a7802465bffca41535cc62ed9571f78' }, 'INTEGRITY_CURRENT_SOURCE');
  for (const n of Object.keys(OBSERVER_ROWS)) equal(c[n], OBSERVER_ROWS[n], 'INTEGRITY_CURRENT_BUILD_BYTES');
  const decode = (data, r) => { if (typeof data !== 'string' || Buffer.from(data, 'base64').toString('base64') !== data) reject('INTEGRITY_COMPONENT_RECORD'); const bytes = Buffer.from(data, 'base64'); if (bytes.length !== r.size || sha(bytes) !== r.sha256) reject('INTEGRITY_COMPONENT_RECORD'); return parseStrict(bytes.toString('utf8')); };
  const build = decode(c.build_bytes, c.build_record), scope = decode(c.scope_bytes, c.build_scope);
  if (build.build_kind !== 'INDEPENDENT_ENGINEERING_02_OBSERVER' || build.scope_sha256 !== c.build_scope.sha256 || build.bootstrap_sha256 !== c.bootstrap.sha256 || build.source_sha256 !== c.source_snapshot.sha256 || build.dll_sha256 !== c.artifact.sha256 || build.dll_size !== c.artifact.size || build.mvid !== c.artifact.mvid || build.self_test_cases !== 38 || build.exit_code !== 0 || Object.hasOwn(build, 'pin_sha256') || scope.product_execution_authorized_by_this_record !== false) reject('INTEGRITY_CURRENT_BUILD');
  return build;
}
function validateWin10Static(b) {
  keys(b, ['schema_version', 'kind', 'status', 'product_identity', 'tool_identity', 'components', 'deployment', 'policy', 'historical_reference', 'implementation_approval', 'execution_scope']);
  if (b.schema_version !== 3 || b.kind !== 'win10-static' || b.status !== 'WIN10_INPUTS_NOT_ADMISSION') reject('INTEGRITY_SCHEMA');
  const h = b.historical_reference; keys(h, ['master', 'observer_build', 'observer_pin', 'contract']);
  equal(h.master, { file: 'master-pin.json', size: 17189, sha256: 'fb4adc2b0bd53b8b1dd4e124e2d9a97e37e9ec1d573c25b48504e54adc22366f' }, 'INTEGRITY_REFERENCE_MASTER');
  equal(h.observer_build, { file: 'observer-v1-build.stdout', size: 492, sha256: '735dfc827ada09d649c03ede4c96a936f5c7da86b2fe3be802a592dac9bfa6db' }, 'INTEGRITY_REFERENCE_BUILD');
  equal(h.observer_pin, { file: 'pin.json', size: 2942, sha256: '0f26ff6477cb516b46c93f744fc2e6b713b079d01b6ff96432ae47e26ca23298' }, 'INTEGRITY_REFERENCE_PIN');
  if (sha(Buffer.from(JSON.stringify(h.contract))) !== '4f3fc737b19b8e089ab0ca656df1fb7fa77136fe35e2fdf110c7edaff599920c') reject('INTEGRITY_REFERENCE_CONTRACT');
  keys(b.product_identity, ['source', 'zip', 'manifest', 'lock', 'helper', 'electron_exe', 'runtime']);
  if (b.product_identity.source !== '8d207ab11d2c8134a81e4e62900f395aae99944e' || b.product_identity.zip.sha256 !== 'e96fdf9678ffede770704fa68cfd39ea7ac6bf42ba0c3dd5fd400aa7dd7cd1a0' || b.product_identity.manifest !== 'd084907ce7d488f0bf98984b49fe09b6e6d5c86b0c9786db46a33c40e62eda1c' || b.product_identity.lock !== '7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e' || b.product_identity.helper !== '2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7' || b.product_identity.electron_exe !== '2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb') reject('INTEGRITY_PRODUCT_IDENTITY');
  row(b.product_identity.zip); if (b.product_identity.zip.size !== 101330419) reject('INTEGRITY_PRODUCT_IDENTITY');
  equal(b.product_identity.runtime, { electron: '22.3.27', node: '16.17.1', abi: '110' }, 'INTEGRITY_RUNTIME');
  keys(b.tool_identity, ['version', 'source_head', 'files', 'files_digest']);
  const v3 = forensic(b);
  if ((!v3 && b.tool_identity.version !== 'engineering-02-v2') || b.tool_identity.source_head !== 'a53c9b9d861486e5923bc82ea70b31b76af1a939') reject('INTEGRITY_TOOL_VERSION');
  const expectedFiles = admission(b) ? ADMISSION_FILES : v3 ? FORENSIC_FILES : FILES;
  const files = b.tool_identity.files; if (!Array.isArray(files) || files.length !== expectedFiles.length) reject('INTEGRITY_TOOL_CLOSURE'); files.forEach(row);
  equal(files.map(r => r.file).sort(), [...expectedFiles].sort(), 'INTEGRITY_TOOL_CLOSURE');
  if (sha(Buffer.from(files.map(r => `${r.file}:${r.size}:${r.sha256}\n`).sort().join(''))) !== b.tool_identity.files_digest) reject('INTEGRITY_TOOL_DIGEST');
  keys(b.components, ['capture', 'observer']);
  if (v3) { for (const id of ['capture', 'observer']) validateForensicComponent(b.components[id], id, files, b.tool_identity.version); }
  else { validateComponent(b.components.capture, 'capture'); validateObserverCurrent(b.components.observer); }
  const cap = h.contract.capture_library;
  if (!v3 && (b.components.capture.artifact.sha256 !== cap.sha256 || b.components.capture.artifact.mvid !== cap.module_version_id || b.components.capture.build_record.sha256 !== cap.build_sha256 || b.components.capture.build_approval.sha256 !== cap.build_approval_sha256)) reject('INTEGRITY_CAPTURE_CLOSURE');
  const expectedRoot = admission(b) ? ADMISSION_ROOT : v3 ? FORENSIC_ROOT : WIN10_ROOT;
  equal(b.deployment, { root: expectedRoot, product_root: expectedRoot + '\\package', host_root: expectedRoot + '\\host', observer_root: expectedRoot + '\\evidence\\observer-components\\' + (v3 ? 'v3' : 'v2') }, 'INTEGRITY_DEPLOYMENT');
  equal(b.policy, POLICY, 'INTEGRITY_POLICY'); equal(b.implementation_approval, APPROVAL, 'SCOPE_APPROVAL'); equal(b.execution_scope, executionScope(b), 'SCOPE_CURRENT_APPROVAL');
  return b;
}
function validateStatic(b) { return b && b.schema_version === 3 ? validateWin10Static(b) : validateLocalStatic(b); }
function legacyMaster(b) {
  if (b.schema_version !== 3) return localLegacyMaster(b);
  validateWin10Static(b); const c = b.historical_reference.contract, ob = b.components.observer;
  const cap = b.components.capture;
  const captureLibrary = forensic(b) ? { ...c.capture_library, size: cap.artifact.size, sha256: cap.artifact.sha256, source_sha256: cap.source_snapshot.sha256, build_sha256: cap.build_record.sha256, build_approval_sha256: cap.build_scope.sha256, runtime_profile: cap.profile, api_profile: cap.api_profile, module_version_id: cap.artifact.mvid } : c.capture_library;
  return { schema_version: 1, status: 'CURRENT_SCOPED_ENGINEERING_MASTER', source: b.product_identity.source, root: b.deployment.root, product_root: b.deployment.product_root, host_root: b.deployment.host_root, reused_input_root: b.deployment.root + '\\inputs', zip: b.product_identity.zip.sha256, manifest: b.product_identity.manifest, lock: b.product_identity.lock, helper: b.product_identity.helper, electron_exe: b.product_identity.electron_exe, inputs: c.inputs, scripts: b.tool_identity.files.filter(r => ['stage-product.ps1', 'launch-product-desktop.ps1', 'serve-product-desktop.ps1'].includes(r.file)), host_files: c.host_files, phases: PHASES, request_limit: 16, validity_minutes: 120, scope_contract_sha256: admission(b) ? ADMISSION_LOCAL_APPROVAL.adr_sha256 : forensic(b) ? FORENSIC_APPROVAL.adr_sha256 : CURRENT_APPROVAL.adr_sha256, approval_evidence_sha256: scopeDigest(b), initial_driver_sha256: b.tool_identity.files.find(r => r.file === 'product-driver.cjs').sha256, capture_library: captureLibrary, sync_contract: c.sync_contract, manifest_observer: { component_dir: b.deployment.observer_root, source: ob.source_snapshot, launcher: b.tool_identity.files.find(r => r.file === 'launch-manifest-observer.ps1'), exe: ob.artifact, contract: c.manifest_observer.contract, build_record: ob.build_record, build_scope: ob.build_scope, bootstrap: ob.bootstrap } };
}
function createWin10Static(reference, productDirectory, componentDirectory, deploymentRoot, sourceHead, toolRoot = __dirname) {
  const old = createStatic(reference, productDirectory, deploymentRoot, sourceHead, toolRoot), m = old.compatibility.master;
  const files = old.tool_identity.files, read = n => fs.readFileSync(plain(path.join(componentDirectory, n)));
  for (const n of Object.keys(OBSERVER_ROWS)) verifyFile(path.join(componentDirectory, OBSERVER_ROWS[n].file), { file: OBSERVER_ROWS[n].file, size: OBSERVER_ROWS[n].size, sha256: OBSERVER_ROWS[n].sha256 });
  verifyFile(path.join(componentDirectory, old.components.observer.source_snapshot.file), old.components.observer.source_snapshot);
  const b = { schema_version: 3, kind: 'win10-static', status: 'WIN10_INPUTS_NOT_ADMISSION', product_identity: old.product_identity, tool_identity: { ...old.tool_identity, version: 'engineering-02-v2' }, components: { capture: old.components.capture, observer: { component_id: 'observer', legacy_source_binding: old.components.observer.legacy_source_binding, source_snapshot: old.components.observer.source_snapshot, ...OBSERVER_ROWS, profile: old.components.observer.profile, api_profile: old.components.observer.api_profile, build_bytes: read('observer-build.json').toString('base64'), scope_bytes: read('observer-build-scope.json').toString('base64') } }, deployment: { ...old.deployment, observer_root: deploymentRoot + '\\evidence\\observer-components\\v2' }, policy: old.policy, historical_reference: { master: fileRow(path.join(reference, 'frozen-control/master-pin.json')), observer_build: old.components.observer.build_record, observer_pin: old.components.observer.build_approval, contract: { capture_library: m.capture_library, sync_contract: m.sync_contract, manifest_observer: { source: m.manifest_observer.source, contract: m.manifest_observer.contract }, host_files: m.host_files, inputs: m.inputs } }, implementation_approval: old.approval, execution_scope: null };
  b.execution_scope = executionScope(b); return validateWin10Static(b);
}
function validateDesktop(record, b, bindingHash) {
  validateWin10Static(b); keys(record, ['schema_version', 'status', 'machine', 'root', 'binding_sha256', 'execution_scope_sha256', 'observed_utc', 'parent', 'identity']);
  if (record.schema_version !== 3 || record.status !== 'ORDINARY_DESKTOP_OBSERVED' || record.machine !== b.execution_scope.machine || record.root !== b.deployment.root || record.binding_sha256 !== bindingHash || record.execution_scope_sha256 !== scopeDigest(b)) reject('IDENTITY_DESKTOP_BINDING');
  parent(record.parent); currentIdentity(record.identity, record.parent, 'ORDINARY_PRODUCT', record.parent.session);
  const at = Date.parse(record.observed_utc); if (!Number.isFinite(at) || at > Date.now() || Date.now() - at > 7200000) reject('IDENTITY_DESKTOP_EXPIRED'); return record;
}
function verifyCurrentChecks(checks, b, bindingHash, recordRoot) {
  keys(checks, ['schema_version', 'status', 'master_sha256', 'execution_scope_sha256', 'source', 'tool_digest', 'component_digest', 'run_id', 'results']);
  if (checks.schema_version !== 3 || checks.status !== 'DIRECTED_WIN10_CHECKS_PASS_NOT_PRODUCT' || checks.master_sha256 !== bindingHash || checks.execution_scope_sha256 !== scopeDigest(b) || checks.source !== b.product_identity.source || checks.tool_digest !== b.tool_identity.files_digest || checks.component_digest !== componentDigest(b)) reject('INTEGRITY_CURRENT_ADMISSION'); identifier(checks.run_id);
  if (!Array.isArray(checks.results) || checks.results.length !== ADMISSION_CASES.length || new Set(checks.results.map(r => r.case_id)).size !== ADMISSION_CASES.length) reject('INTEGRITY_ADMISSION_SET');
  for (const r of checks.results) {
    keys(r, ['case_id', 'status', 'record']); if (!ADMISSION_CASES.includes(r.case_id) || r.status !== 'PASS') reject('INTEGRITY_ADMISSION_RESULT'); row(r.record); verifyFile(path.join(recordRoot, r.record.file), r.record);
    const direct = readJson(path.join(recordRoot, r.record.file));
    keys(direct, ['schema_version', 'status', 'evidence_scope', 'case_id', 'machine', 'master_sha256', 'execution_scope_sha256', 'tool_digest', 'component_digest', 'run_id', 'source', 'pid', 'creation_ticks', 'details']);
    if (direct.schema_version !== 3 || direct.status !== 'PASS' || direct.evidence_scope !== 'WIN10_DIRECT' || direct.case_id !== r.case_id || direct.machine !== b.execution_scope.machine || direct.master_sha256 !== bindingHash || direct.execution_scope_sha256 !== scopeDigest(b) || direct.tool_digest !== checks.tool_digest || direct.component_digest !== checks.component_digest || direct.run_id !== checks.run_id || direct.source !== checks.source || !Number.isInteger(direct.pid) || direct.pid < 1 || typeof direct.creation_ticks !== 'string' || !/^[1-9][0-9]{17}$/.test(direct.creation_ticks)) reject('INTEGRITY_DIRECT_ADMISSION_RECORD');
    verifyAdmissionDetails(direct, b, bindingHash);
  }
  return checks;
}
function verifyAdmissionDetails(r, b, bindingHash) {
  const d = r.details, m = legacyMaster(b), ob = b.components.observer;
  switch (r.case_id) {
    case 'ps51-parse': {
      keys(d, ['ps_version', 'files']); if (!/^5\.1\./.test(d.ps_version) || !Array.isArray(d.files) || d.files.length !== b.tool_identity.files.filter(x => x.file.endsWith('.ps1')).length) reject('INTEGRITY_PS51_ADMISSION');
      for (const x of d.files) { keys(x, ['file', 'size', 'sha256', 'errors']); equal({ file: x.file, size: x.size, sha256: x.sha256 }, b.tool_identity.files.find(f => f.file === x.file), 'INTEGRITY_PARSE_SOURCE'); equal(x.errors, [], 'INTEGRITY_PARSE_ERRORS'); }
      equal(d.files.map(x => x.file).sort(), b.tool_identity.files.filter(x => x.file.endsWith('.ps1')).map(x => x.file).sort(), 'INTEGRITY_PARSE_SET'); break;
    }
    case 'node16-cli':
      keys(d, ['versions', 'cli_status', 'exit_code', 'syntax_files', 'self_tests']); equal(d.versions, b.product_identity.runtime, 'INTEGRITY_RUNTIME');
      if (d.cli_status !== 'WIN10_STATIC_VERIFIED_NOT_ADMISSION' || d.exit_code !== 0) reject('INTEGRITY_CLI_ADMISSION');
      equal(d.syntax_files, b.tool_identity.files.filter(f => f.file.endsWith('.cjs')), 'INTEGRITY_SYNTAX_CLOSURE');
      equal(d.self_tests, { main: 128, sync: 88, restart: 31, recovery: 33 }, 'INTEGRITY_NATIVE_SELF_CHECKS'); break;
    case 'physical-closure':
      keys(d, ['product_files', 'host_files', 'zip_sha256', 'manifest_sha256', 'helper_sha256', 'electron_sha256']);
      equal(d, { product_files: 784, host_files: m.host_files.length, zip_sha256: b.product_identity.zip.sha256, manifest_sha256: b.product_identity.manifest, helper_sha256: b.product_identity.helper, electron_sha256: b.product_identity.electron_exe }, 'INTEGRITY_PHYSICAL_ADMISSION'); break;
    case 'request-revision': {
      keys(d, ['revisions']); const labels = ['controlled-boot', 'normal-short', 'normal-full', 'ready-negative'];
      equal(d.revisions, labels.map(label => ({ label, sha256: sha(Buffer.from(JSON.stringify(createRevision(b, bindingHash, label), null, 2) + '\n')) })), 'INTEGRITY_REVISION_ADMISSION'); break;
    }
    case 'capture-probe':
      keys(d, ['artifact_sha256', 'mvid', 'api_profile', 'identity', 'snapshot_count']);
      if (d.artifact_sha256 !== b.components.capture.artifact.sha256 || d.mvid !== b.components.capture.artifact.mvid || d.api_profile !== b.components.capture.api_profile || !Number.isInteger(d.snapshot_count) || d.snapshot_count < 1 || d.snapshot_count > 32768) reject('INTEGRITY_CAPTURE_ADMISSION');
      currentIdentity(d.identity, { pid: r.pid, creation_ticks: r.creation_ticks, session: 0 }, 'ADMIN_TOOL_ADMISSION'); break;
    case 'observer-etw': {
      keys(d, ['artifact_sha256', 'mvid', 'admission']); const a = d.admission, f = a && a.observer_final;
      if (d.artifact_sha256 !== ob.artifact.sha256 || d.mvid !== ob.artifact.mvid || !a || a.status !== 'OBSERVER_ADMISSION_PASS_NOT_PRODUCT_ACCEPTANCE' || a.error !== null || a.cmd_count !== 1 || a.powershell_count !== 1 || a.observer_exit !== 0 || a.build_scope_sha256 !== ob.build_scope.sha256 || a.exe_sha256 !== ob.artifact.sha256 || a.mvid !== ob.artifact.mvid || !f || f.status !== 'OBSERVER_FINAL_CLOSED' || f.master_sha256 !== bindingHash || f.source !== ob.legacy_source_binding || f.request_id !== a.request_id || f.events_lost !== 0 || f.log_buffers_lost !== 0 || f.realtime_buffers_lost !== 0 || !Array.isArray(a.proofs) || a.proofs.length !== 2 || !Array.isArray(a.unexpected_descendants) || a.unexpected_descendants.length) reject('INTEGRITY_ETW_ADMISSION'); break;
    }
    case 'cross-account-access':
      keys(d, ['ordinary_parent', 'ordinary_identity', 'directions']); parent(d.ordinary_parent); currentIdentity(d.ordinary_identity, d.ordinary_parent, 'ORDINARY_PRODUCT', d.ordinary_parent.session);
      equal(d.directions, ['admin-write-user-read', 'user-write-admin-read', 'admin-read-user-write', 'user-read-admin-write'].map(direction => ({ direction, status: 'PASS' })), 'INTEGRITY_ACCESS_ADMISSION'); break;
    default: reject('INTEGRITY_ADMISSION_CASE');
  }
}
function assertRegistration(b, bindingHash, revisionFile, revisionHash) {
  const bytes = fs.readFileSync(plain(revisionFile)); if (sha(bytes) !== revisionHash) reject('INTEGRITY_REVISION_HASH');
  const revision = unwrapRevision(parseStrict(bytes.toString('utf8')), b, bindingHash), inputs = path.join(b.deployment.root, 'inputs');
  const r = readJson(path.join(inputs, 'registration-' + revisionHash + '.json'));
  keys(r, ['schema_version', 'status', 'master_sha256', 'revision_sha256', 'execution_scope_sha256', 'checks_sha256']);
  if (r.schema_version !== 3 || r.status !== 'CURRENT_SCOPE_BOUND_CHECKED_REVISION' || r.master_sha256 !== bindingHash || r.revision_sha256 !== revisionHash || r.execution_scope_sha256 !== scopeDigest(b)) reject('INTEGRITY_CURRENT_REGISTRATION'); hash(r.checks_sha256);
  const f = path.join(inputs, 'checks-' + r.checks_sha256 + '.json'); if (sha(fs.readFileSync(plain(f))) !== r.checks_sha256) reject('INTEGRITY_CHECKS_HASH'); verifyCurrentChecks(readJson(f), b, bindingHash, inputs); return revision;
}
function productRecordFiles(b, rootDir, bindingHash) {
  return product(b) ? { desktop: path.join(rootDir, 'evidence', 'desktop-session-' + bindingHash + '.json'), admission: path.join(rootDir, 'inputs', 'admission-' + bindingHash + '.json') } : { desktop: path.join(rootDir, 'evidence', 'desktop-session.json'), admission: path.join(rootDir, 'inputs', 'admission.json') };
}
function productGate(b) {
  const s = b.execution_scope, a = s.remote_approval;
  if (!a) reject('SCOPE_PRODUCT_REMOTE_NOT_APPROVED');
  if (Date.now() < Date.parse(a.approved_at) || Date.now() >= Date.parse(a.valid_until)) reject('SCOPE_PRODUCT_APPROVAL_EXPIRED');
  if (s.product_execution_authorized !== true) reject('SCOPE_PRODUCT_NOT_AUTHORIZED');
}
function assertProductRequest(b, phase, label) {
  validateStatic(b); if (b.schema_version !== 3 || !product(b)) reject('SCOPE_PRODUCT_REQUEST');
  if (!b.execution_scope.remote_approval) reject('SCOPE_PRODUCT_REMOTE_NOT_APPROVED');
  if (!b.execution_scope.product.phases.includes(phase) || !b.execution_scope.product.revision_labels.includes(label)) reject('SCOPE_PRODUCT_REQUEST');
  return { phase, label };
}
function requireWin10Execution(b, role = 'ORDINARY_PRODUCT', operation, context, bindingHash) {
  validateStatic(b); if (b.schema_version !== 3) reject('SCOPE_WIN10_NOT_AUTHORIZED');
  const productRole = product(b) && operation === undefined && PRODUCT_ROLES.includes(role);
  if (productRole) productGate(b);
  else if (admission(b)) { validateAdmissionOperation(b, role, operation); if (!b.execution_scope.remote_approval) reject('SCOPE_ADMISSION_REMOTE_NOT_APPROVED'); const a = b.execution_scope.remote_approval; if (Date.now() < Date.parse(a.approved_at) || Date.now() >= Date.parse(a.valid_until)) reject('SCOPE_ADMISSION_APPROVAL_EXPIRED'); }
  else if (forensic(b)) reject('SCOPE_R3_REMOTE_NOT_APPROVED');
  if (process.platform !== 'win32' || require('os').hostname() !== b.execution_scope.machine || require('os').release() !== '10.0.19045' || process.versions.node !== '16.17.1' || process.versions.electron !== '22.3.27' || process.versions.modules !== '110') reject('INTEGRITY_WIN10_EXECUTION_RUNTIME');
  if (!b.execution_scope.roles.includes(role)) reject('SCOPE_EXECUTION_ROLE');
  if (admission(b) && !productRole && context !== 'BOOTSTRAP_IDENTITY_ONLY') { validateAdmissionContext(context, b); if (context.role !== role || context.operation !== operation || context.parent.pid !== process.ppid) reject('IDENTITY_ADMISSION_CALLER'); }
  if (role === 'ORDINARY_PRODUCT') {
    const inputs = path.join(b.deployment.root, 'inputs');
    let hashValue = bindingHash;
    if (product(b)) { hash(hashValue); if (sha(Buffer.from(JSON.stringify(b, null, 2) + '\n')) !== hashValue) reject('INTEGRITY_PRODUCT_BINDING_HASH'); }
    else hashValue = sha(fs.readFileSync(plain(path.join(inputs, 'master-pin.json'))));
    const files = productRecordFiles(b, b.deployment.root, hashValue);
    validateDesktop(readJson(files.desktop), b, hashValue); verifyCurrentChecks(readJson(files.admission), b, hashValue, inputs);
  }
  return role;
}
function verifyAdmission(results, required) {
  if (!Array.isArray(results) || !Array.isArray(required) || new Set(required).size !== required.length || required.length < 1) reject('INTEGRITY_ADMISSION_SET');
  if (results.length !== required.length || new Set(results.map(r => r.case_id)).size !== results.length) reject('INTEGRITY_ADMISSION_SET');
  for (const r of results) { keys(r, ['case_id', 'status', 'source', 'tool_digest', 'run_id']); if (!required.includes(r.case_id) || r.status !== 'PASS') reject('INTEGRITY_ADMISSION_RESULT'); source(r.source); hash(r.tool_digest); identifier(r.run_id); }
  const first = results[0]; if (results.some(r => r.source !== first.source || r.tool_digest !== first.tool_digest || r.run_id !== first.run_id)) reject('INTEGRITY_ADMISSION_BINDING');
}
function cli(args) {
  const operation = args[0];
  if (operation === 'validate-generations' && args.length === 6) { loadStatic(args[1], args[2]); const text = fs.readFileSync(plain(args[3]), 'utf8'); if (Buffer.byteLength(text) > 8388608 || (text && !text.endsWith('\n'))) reject('INTEGRITY_ETW_LOG_BYTES'); return verifyObserverGenerations(text ? text.trimEnd().split('\n').map(parseStrict) : [], { pid: Number(args[4]), create_ft: args[5] }); }
  if (operation === 'validate-build-scope' && args.length === 3) { if (sha(fs.readFileSync(plain(args[1]))) !== args[2]) reject('INTEGRITY_BUILD_SCOPE_BYTES'); return validateForensicScope(readJson(args[1])); }
  if (operation === 'forensic-static' && args.length === 6) { const b = createForensicStatic(loadStatic(args[1], args[2]), args[3], args[4]); return { status: b.status, sha256: writeNew(output(args[5]), b) }; }
  if (operation === 'forensic-static-inherited' && args.length === 8) { const b = createForensicStatic(loadStatic(args[1], args[2], args[3]), args[4], args[5], __dirname, args[6]); return { status: b.status, sha256: writeNew(output(args[7]), b) }; }
  if (operation === 'validate-exclusion' && args.length === 6) { const b = loadStatic(args[1], args[2]); return validateCaptureExclusion(readJson(args[3]), { source: b.product_identity.source, master_sha256: args[2], revision_sha256: args[4], request_id: args[5] }); }
  if (operation === 'win10-static' && args.length === 7) { const b = createWin10Static(args[1], args[2], args[3], args[4], args[5]); return { status: b.status, sha256: writeNew(output(args[6]), b) }; }
  if (operation === 'project-master' && args.length === 3) return legacyMaster(loadStatic(args[1], args[2]));
  if (operation === 'admission-digests' && args.length === 3) { const b = loadStatic(args[1], args[2]); if (!admission(b)) reject('SCOPE_ADMISSION_VERSION'); return { execution_scope_sha256: scopeDigest(b), component_digest: componentDigest(b), admission_revision_sha256: sha(Buffer.from(JSON.stringify(createRevision(b, args[2], 'controlled-boot'), null, 2) + '\n')) }; }
  if (operation === 'admission-revision' && args.length === 3) { const b = loadStatic(args[1], args[2]); if (!admission(b)) reject('SCOPE_ADMISSION_VERSION'); const bytes = Buffer.from(JSON.stringify(createRevision(b, args[2], 'controlled-boot'), null, 2) + '\n'); return { sha256: sha(bytes), bytes: bytes.toString('base64') }; }
  if (operation === 'admission-static' && args.length === 5) { const b = createAdmissionStatic(loadStatic(args[1], args[2], args[3])); return { status: b.execution_scope.status, sha256: writeNew(output(args[4]), b) }; }
  if (operation === 'admission-approved' && args.length === 5) { const b = approveAdmissionStatic(loadStatic(args[1], args[2]), readJson(args[3])); return { status: b.execution_scope.status, sha256: writeNew(output(args[4]), b) }; }
  if (operation === 'authorize-admission-start' && args.length === 5) { const b = loadStatic(args[1], args[2]); return { role: requireWin10Execution(b, args[3], args[4], 'BOOTSTRAP_IDENTITY_ONLY'), operation: args[4] }; }
  if (operation === 'authorize-admission' && args.length === 7) { const b = loadStatic(args[1], args[2]), c = admissionContextFile(b, args[2], args[5], args[6]); return { role: requireWin10Execution(b, args[3], args[4], c), run_id: c.run_id, operation: c.operation }; }
  if (operation === 'verify-capability' && args.length === 7) { const b = loadStatic(args[1], args[2]); hash(args[6]); if (sha(fs.readFileSync(plain(args[5]))) !== args[6]) reject('INTEGRITY_CAPABILITY_HASH'); const r = readJson(args[5]), c = admissionContextFile(b, args[2], args[3], args[4], Date.parse(r.finished_at)); if (path.resolve(args[5]) !== path.resolve(path.join(b.deployment.root, 'runs', c.run_id, 'capability-result.json'))) reject('SCOPE_CAPABILITY_RESULT_PATH'); return verifyCapabilityFiles(r, b, c); }
  if (operation === 'execution-scope' && args.length === 3) { const b = loadStatic(args[1], args[2]); validateWin10Static(b); return b.execution_scope; }
  if (operation === 'authorize' && args.length === 4) { const b = loadStatic(args[1], args[2]); return { role: requireWin10Execution(b, args[3], undefined, undefined, args[2]) }; }
  if (operation === 'assert-product-request' && args.length === 5) { const b = loadStatic(args[1], args[2]); return assertProductRequest(b, args[3], args[4]); }
  if (operation === 'product-static' && args.length === 5) { const b = createProductStatic(loadStatic(args[1], args[2], args[3])); return { status: b.execution_scope.status, sha256: writeNew(output(args[4]), b) }; }
  if (operation === 'unwrap-revision' && args.length === 5) { const b = loadStatic(args[1], args[2]); if (sha(fs.readFileSync(plain(args[3]))) !== args[4]) reject('INTEGRITY_REVISION_HASH'); return unwrapRevision(readJson(args[3]), b, args[2]); }
  if (operation === 'assert-registration' && args.length === 5) return assertRegistration(loadStatic(args[1], args[2]), args[2], args[3], args[4]);
  if (operation === 'assert-desktop' && args.length === 4) return validateDesktop(readJson(args[3]), loadStatic(args[1], args[2]), args[2]);
  if (operation === 'assert-components' && args.length === 3) {
    const b = loadStatic(args[1], args[2]); validateWin10Static(b);
    if (forensic(b)) { for (const id of ['capture', 'observer']) { const c = b.components[id]; const dir = id === 'capture' ? path.join(b.deployment.root, 'inputs') : b.deployment.observer_root; for (const r of [c.source_snapshot, c.artifact, c.build_record, c.build_scope, c.bootstrap]) verifyFile(path.join(dir, r.file), { file: r.file, size: r.size, sha256: r.sha256 }); for (const r of validateForensicComponent(c, id, b.tool_identity.files, b.tool_identity.version).dependencies) verifyFile(r.path, { file: r.file, size: r.size, sha256: r.sha256 }); } return { status: 'CURRENT_COMPONENT_FILES_VERIFIED_NOT_RUNTIME_ADMISSION' }; }
    for (const c of [b.components.capture]) for (const r of [c.source_snapshot, c.artifact, c.build_record, c.build_approval]) verifyFile(path.join(b.deployment.root, 'inputs', r.file), { file: r.file, size: r.size, sha256: r.sha256 });
    const c = b.components.observer; for (const r of [c.source_snapshot, c.artifact, c.build_record, c.build_scope, c.bootstrap]) verifyFile(path.join(b.deployment.observer_root, r.file), { file: r.file, size: r.size, sha256: r.sha256 });
    for (const r of validateObserverCurrent(c).dependencies) verifyFile(r.path, { file: r.file, size: r.size, sha256: r.sha256 });
    return { status: 'CURRENT_COMPONENT_FILES_VERIFIED_NOT_RUNTIME_ADMISSION' };
  }
  if (operation === 'static' && args.length === 6) { const b = createStatic(args[1], args[2], args[3], args[4]); const digest = writeNew(output(args[5]), b); return { status: b.status, sha256: digest }; }
  if (operation === 'verify-static' && args.length === 3) { const b = loadStatic(args[1], args[2]); return { status: b.schema_version === 3 ? 'WIN10_STATIC_VERIFIED_NOT_ADMISSION' : 'LOCAL_STATIC_VERIFIED_NOT_WIN10_ADMISSION' }; }
  if (operation === 'revision' && args.length === 5) { const b = loadStatic(args[1], args[2]); const r = createRevision(b, args[2], args[3]); return { status: r.status, sha256: writeNew(output(args[4]), r) }; }
  if (operation === 'runtime' && args.length === 8) { const b = loadStatic(args[1], args[2]); const r = createRuntime(b, readJson(args[3]), readJson(args[4]), args[5], readJson(args[6])); const digest = writeNew(output(args[7]), r); return { status: r.status, sha256: digest }; }
  if (operation === 'verify-runtime' && args.length === 6) { verifyRuntime(readJson(args[3]), loadStatic(args[1], args[2]), readJson(args[4])); if (args[5] !== 'local-replay') reject('SCOPE_MODE'); return { status: 'LOCAL_RUNTIME_VERIFIED_NOT_PRODUCT' }; }
  reject('INTEGRITY_CLI_ARGUMENTS');
}
module.exports = { validateOrdinaryCaptureSet, admission, product, PRODUCT_ROLES, PRODUCT_SCOPE, PRODUCT_LOCAL_APPROVAL, createProductStatic, assertProductRequest, productRecordFiles, ADMISSION_FILES, ADMISSION_ROOT, ADMISSION_OPERATIONS, ADMISSION_LOCAL_APPROVAL, createAdmissionStatic, approveAdmissionStatic, validateAdmissionOperation, validateAdmissionContext, verifyCapability, PHASES, FILES, FORENSIC_FILES, FORENSIC_ROOT, FORENSIC_APPROVAL, FORENSIC_ORIGINS, FORENSIC_DEPENDENCIES, forensic, createForensicScope, validateForensicScope, validateForensicComponent, createForensicStatic, buildArguments, validateCaptureExclusion, verifyObserverGenerations, POLICY, APPROVAL, CURRENT_APPROVAL, ADMISSION_CASES, sha, reject, keys, parseStrict, readJson, fileRow, verifyFile, writeNew, validateStatic, verifyStaticFiles, loadStatic, createStatic, createWin10Static, legacyMaster, createRevision, unwrapRevision, currentIdentity, validateReceipt, createRuntime, verifyRuntime, scopeDigest, componentDigest, validateDesktop, verifyCurrentChecks, assertRegistration, requireWin10Execution, verifyAdmission, cli };
if (require.main === module) { try { process.stdout.write(JSON.stringify(cli(process.argv.slice(2))) + '\n'); } catch (error) { process.stderr.write(JSON.stringify({ status: 'FAIL', error: error.code || 'INTERNAL_VALIDATION_ERROR' }) + '\n'); process.exitCode = 1; } }
