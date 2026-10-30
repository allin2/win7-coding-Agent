'use strict';
// Local-only binder. Reads the parent's source/package; only writes a NEW output directory.
// Usage: node a9-42-office-prepare.cjs spec.json
// spec: {source_root, zip_path, output_root, source_commit, run_id, session_id,
//        execution_binding_path, target_tools_root}. No target connection or launch.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { pathToFileURL } = require('url');
const { createRequire } = require('module');
const driver = require('./a9-42-office-journey.cjs');
const need = (v, code) => { if (!v) throw new Error(code); };
function verifySourceIdentity(s) {
  const git = args => cp.execFileSync('git', ['-C', s.source_root, ...args], { maxBuffer: 8 * 1024 * 1024 });
  const packageTree = git(['rev-parse', s.source_commit + ':src']).toString().trim();
  const currentTree = git(['rev-parse', 'HEAD:src']).toString().trim();
  need(packageTree === currentTree, 'PREPARE_CURRENT_SOURCE');
  need(git(['diff','--name-only','HEAD','--','src']).length === 0
    && git(['ls-files','--others','--exclude-standard','--','src']).length === 0, 'PREPARE_SOURCE_DIRTY');
  return { source_tree: packageTree, binding_tool_commit: git(['rev-parse','HEAD']).toString().trim() };
}
// Bind both the declared source checkout and the code this prepare will deploy.
function verifyExecutionSource(s, entry) {
  const toolRoot = path.resolve(__dirname, '../..');
  return driver.driverClosure(entry).map(relative => {
    let committed;
    try {
      committed = cp.execFileSync('git', ['-C', s.source_root, 'show', s.source_commit + ':' + relative],
        { maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (_) { throw new Error('PREPARE_EXECUTION_SOURCE_MISSING'); }
    const expected = driver.hash(committed);
    for (const root of [s.source_root, toolRoot]) {
      const file = path.join(root, ...relative.split('/'));
      need(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink()
        && driver.hash(fs.readFileSync(file)) === expected, 'PREPARE_EXECUTION_SOURCE_MISMATCH');
    }
    return { path: relative, sha256: expected };
  });
}
async function prepare(s) {
  need(s && Object.keys(s).sort().join(',') === ['source_root','zip_path','output_root','source_commit','run_id','session_id','execution_binding_path','target_tools_root'].sort().join(','), 'PREPARE_FIELDS');
  for (const k of ['source_root','zip_path','output_root']) need(path.isAbsolute(s[k]), 'PREPARE_LOCAL_PATH');
  need(path.isAbsolute(s.execution_binding_path), 'PREPARE_LOCAL_PATH');
  need(!fs.existsSync(s.output_root), 'PREPARE_OUTPUT_EXISTS');
  const execution = driver.loadExecutionBinding({ executionBindingPath: s.execution_binding_path });
  need(execution.run_id === s.run_id && execution.source_commit === s.source_commit, 'PREPARE_EXECUTION_BINDING');
  need(s.target_tools_root === execution.layout.tools_root, 'PREPARE_TARGET_LAYOUT');
  const git = args => cp.execFileSync('git', ['-C', s.source_root, ...args], { maxBuffer: 8 * 1024 * 1024 });
  const sourceIdentity = verifySourceIdentity(s);
  const executionFiles = verifyExecutionSource(s, 'a9-42-office-journey.cjs');
  const zip = await import(pathToFileURL(path.join(__dirname, '../release/zip-utils.mjs')).href);
  const entries = zip.readZipEntries(s.zip_path).filter(e => !e.directory);
  const manifests = entries.filter(e => e.name.endsWith('/release-manifest.json'));
  need(manifests.length === 1, 'PREPARE_ZIP_MANIFEST');
  const manifestBytes = zip.readZipEntry(manifests[0]); const m = JSON.parse(manifestBytes);
  need(m.source_commit === s.source_commit && m.source_dirty === false && m.external_acceptance_eligible === true
    && driver.hash(manifestBytes) === execution.manifest_sha256
    && driver.hash(fs.readFileSync(s.zip_path)) === execution.package_sha256, 'PREPARE_PACKAGE_SOURCE');
  const prefix = manifests[0].name.slice(0, -'release-manifest.json'.length);
  need(entries.length === m.files.length + 1, 'PREPARE_ZIP_EXTRA');
  need(new Set(entries.map(e => e.name.toLowerCase())).size === entries.length, 'PREPARE_ZIP_DUPLICATE');
  const products = []; const compiled = []; const compilers = new Map();
  const buildRoot = s.output_root + '.compiled';
  need(!fs.existsSync(buildRoot), 'PREPARE_BUILD_OUTPUT_EXISTS');
  const compile = name => {
    need(['core','gateway','git-adapter','runner','shell','state','workspace'].includes(name), 'PREPARE_MODULE');
    if (compilers.has(name)) return compilers.get(name).output;
    const root = path.join(s.source_root, 'src', name);
    const compiler = createRequire(path.join(root, 'package.json')).resolve('typescript/bin/tsc');
    const output = path.join(buildRoot, name);
    fs.mkdirSync(output, { recursive: true });
    cp.execFileSync(process.execPath, [compiler, '--project', path.join(root, 'tsconfig.json'),
      '--outDir', output, '--declaration', 'false', '--declarationMap', 'false', '--sourceMap', 'false'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2 * 1024 * 1024 });
    compilers.set(name, { module: name, output, compiler_sha256: driver.hash(fs.readFileSync(compiler)) });
    return output;
  };
  const zipNames = new Map(entries.map(e => [e.name, e]));
  const seen = new Set();
  for (const e of m.files) {
    need(typeof e.path === 'string' && !e.path.includes('\\') && !e.path.split('/').some(p => !p || p === '.' || p === '..') && !seen.has(e.path), 'PREPARE_MANIFEST_PATH');
    seen.add(e.path);
    const z = zipNames.get(prefix + e.path); need(z, 'PREPARE_ZIP_MISSING');
    const bytes = zip.readZipEntry(z);
    need(bytes.length === e.size && driver.hash(bytes) === e.sha256, 'PREPARE_ZIP_HASH');
    if (e.path.startsWith('resources/app/product/')) {
      const source = e.path.replace('resources/app/product/', 'src/shell/product/');
      const blob = git(['show', s.source_commit + ':' + source]);
      need(driver.hash(blob) === e.sha256 && driver.hash(fs.readFileSync(path.join(s.source_root, source))) === e.sha256, 'PREPARE_SOURCE_PRODUCT_MISMATCH');
      products.push({ path: e.path, source, sha256: e.sha256 });
    }
    const match = /^resources\/app\/(?:([^/]+)\/)?dist\/(.+)$/.exec(e.path);
    if (match) {
      const moduleName = match[1] || 'shell';
      const source = `src/${moduleName}/dist/${match[2]}`;
      const file = path.join(compile(moduleName), match[2]);
      need(driver.hash(fs.readFileSync(file)) === e.sha256, 'PREPARE_COMMITTED_BUILD_MISMATCH');
      compiled.push({ path: e.path, source, sha256: e.sha256 });
    }
  }
  need(products.length > 10 && compiled.length > 10, 'PREPARE_PRODUCT_CLOSURE');
  const driverBytes = fs.readFileSync(path.join(__dirname, 'a9-42-office-journey.cjs'));
  const layout = execution.layout;
  const c = { schema_version: 1, evidence_class: execution.evidence_class, profile: 'office-journey', run_id: execution.run_id,
    source_commit: execution.source_commit, zip_sha256: execution.package_sha256,
    manifest_sha256: execution.manifest_sha256, driver_sha256: driver.hash(driverBytes),
    source_binding_sha256: '0'.repeat(64), manifest_file_count: m.files.length, session_id: s.session_id,
    task_name: driver.taskNameFor(execution, 'office-journey'), deadline_utc: null, real_model_request_limit: 0,
    input_package_root: layout.input_package_root, zip_path: layout.zip_path,
    run_root: layout.run_root, package_root: layout.package_root, workspace_root: layout.workspace_root,
    data_root: layout.data_root, cmd_path: layout.cmd_path, source_binding_path: layout.source_binding_path,
    execution_binding_path: layout.execution_binding_path, execution_binding_sha256: execution.sha256,
    helper_sha256: execution.helper_sha256 };
  const binding = { execution_files: executionFiles, schema_version: 1, source_commit: c.source_commit,
    ...sourceIdentity,
    zip_sha256: c.zip_sha256, manifest_sha256: c.manifest_sha256, driver_sha256: c.driver_sha256,
    execution_binding_sha256: c.execution_binding_sha256,
    product_files: products, compiled_files: compiled,
    compilers: [...compilers.values()],
    source_build_boundary: 'Current committed source recompiled with product declaration/map/sourceMap flags disabled; output bytes matched the package. Native inputs are not rebuilt.' };
  const bindingBytes = Buffer.from(JSON.stringify(binding, null, 2) + '\n', 'utf8');
  c.source_binding_sha256 = driver.hash(bindingBytes);
  driver.validateConfig(c, Date.now(), true, { executionBindingPath: s.execution_binding_path });
  fs.mkdirSync(s.output_root, { recursive: true });
  const write = (name, bytes) => fs.writeFileSync(path.join(s.output_root, name), bytes, { flag: 'wx' });
  write('source-binding.json', bindingBytes);
  driver.copyDriverClosure(s.output_root, 'a9-42-office-journey.cjs');
  driver.verifyDriverClosure(executionFiles, 'a9-42-office-journey.cjs', fs, s.output_root);
  write('execution-binding.json', execution.bytes);
  write('config-template.json', JSON.stringify(c, null, 2) + '\n');
  write('launch-template.cmd', '@echo off\r\nsetlocal\r\nset NODE_OPTIONS=\r\nset ELECTRON_RUN_AS_NODE=1\r\n"%~dp0package\\electron.exe" "%~dp0scripts\\win7-dev\\a9-42-office-journey.cjs" --config "%~dp0..\\e\\config.json"\r\nexit /b %errorlevel%\r\n');
  return { status: 'LOCAL_PREPARATION_ONLY', output_root: s.output_root, source_commit: c.source_commit,
    driver_sha256: c.driver_sha256, zip_sha256: c.zip_sha256, deadline_utc: null, target_execution: 'NOT_PERFORMED' };
}
module.exports = { prepare, verifySourceIdentity, verifyExecutionSource };
if (require.main === module) prepare(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))
  .then(r => process.stdout.write(JSON.stringify(r) + '\n'))
  .catch(e => { process.stderr.write(driver.safeError(e) + '\n'); process.exitCode = 1; });
