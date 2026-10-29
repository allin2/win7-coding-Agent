import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { copyOfficeLiteRuntime } from '../office-lite-runtime.mjs';
import { copyDirectory } from '../release-contract.mjs';
import { remotePath } from '../../win7-dev/win7-dev.mjs';

test('copies the real locked Office closure and executes its packaged Worker without source-directory dependencies', async () => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-package-'));
  const rows = copyOfficeLiteRuntime(process.cwd(), stage, copyDirectory);
  assert.equal(rows.length, 99);
  const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'office-lite/DELIVERY_MANIFEST.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.ok(manifest.omitted.length > 0);
  const sha = value => crypto.createHash('sha256').update(value).digest('hex');
  assert.equal(manifest.lockSha256, sha(fs.readFileSync(path.join(stage, 'office-lite/package-lock.json'))));
  assert.equal(manifest.dependenciesSha256, sha(fs.readFileSync(path.join(stage, 'office-lite/DEPENDENCIES.json'))));
  assert.equal(new Set(manifest.copied.map(item => item.path)).size, manifest.copied.length);
  const omittedPaths = new Set(manifest.omitted.map(item => item.path));
  assert.equal(omittedPaths.size, manifest.omitted.length);
  assert.ok(manifest.copied.every(item => !omittedPaths.has(item.path)));
  for (const item of manifest.copied) {
    assert.equal(sha(fs.readFileSync(path.join(stage, 'office-lite', item.path))), item.sha256);
    remotePath(`cand/0000000000000000/expanded/Win7CodingAgent-0.3.0-alpha.2-win7-x64/resources/app/office-lite/${item.path}`);
  }
  for (const item of manifest.omitted) {
    assert.match(item.reason, /TypeScript/);
    assert.equal(fs.existsSync(path.join(stage, 'office-lite', item.path)), false);
  }
  const requireFromStage = createRequire(path.join(stage, 'office-lite/package.json'));
  for (const name of ['docx', 'exceljs', '@xmldom/xmldom', 'jszip']) assert.ok(requireFromStage(name));
  assert.equal(rows.every(row => row.optionalModule === 'office-lite'), true);
  fs.mkdirSync(path.join(stage, 'product'));
  for (const name of ['office-lite-worker.js', 'office-lite-engine.js', 'office-lite-zip.js']) {
    fs.copyFileSync(path.join(process.cwd(), 'src/shell/product', name), path.join(stage, 'product', name));
  }
  const run = workerData => new Promise((resolve, reject) => {
    const worker = new Worker(path.join(stage, 'product/office-lite-worker.js'), { workerData });
    let response;
    worker.on('message', value => { response = value; }); worker.on('error', reject);
    worker.on('exit', code => code === 0 ? resolve(response) : reject(new Error('packaged worker failed')));
  });
  for (const [format, content] of [
    ['docx', { schemaVersion: 1, format: 'docx', blocks: [{ type: 'paragraph', text: '原文' }] }],
    ['xlsx', { schemaVersion: 1, format: 'xlsx', sheets: [{ name: '包内', rows: [['原文', 1]] }] }],
  ]) {
    const result = await run({ action: 'write', format, content });
    assert.equal(result.ok, true);
    const source = Buffer.from(result.result.buffer);
    const before = sha(source);
    const read = await run({ action: 'read', format, buffer: source });
    assert.equal(read.ok, true); assert.match(JSON.stringify(read.result.units), /原文/);
    const updated = JSON.parse(JSON.stringify(content).replace('原文', '副本'));
    const copy = await run({ action: 'write', format, content: updated });
    assert.equal(copy.ok, true);
    const readCopy = await run({ action: 'read', format, buffer: copy.result.buffer });
    assert.equal(readCopy.ok, true); assert.match(JSON.stringify(readCopy.result.units), /副本/);
    assert.equal(sha(source), before);
  }
});

test('rejects modified dependency bytes even when the declared version still matches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-tamper-'));
  const source = path.join(root, 'src/shell/office-lite');
  fs.mkdirSync(path.join(source, 'node_modules/demo'), { recursive: true });
  const bytes = JSON.stringify({ name: 'demo', version: '1.0.0', license: 'MIT' });
  fs.writeFileSync(path.join(source, 'package.json'), '{}');
  fs.writeFileSync(path.join(source, 'node_modules/demo/package.json'), bytes);
  fs.writeFileSync(path.join(source, 'node_modules/demo/index.js'), 'changed');
  const lock = JSON.stringify({ packages: { '': {}, 'node_modules/demo': { version: '1.0.0', integrity: 'bound' } } });
  fs.writeFileSync(path.join(source, 'package-lock.json'), lock);
  const sha = value => crypto.createHash('sha256').update(value).digest('hex');
  fs.writeFileSync(path.join(source, 'DEPENDENCIES.json'), JSON.stringify({ lockSha256: sha(lock), packages: [{
    path: 'node_modules/demo', version: '1.0.0', integrity: 'bound', license: 'MIT', files: [
      { path: 'package.json', sha256: sha(bytes) }, { path: 'index.js', sha256: sha('original') },
    ],
  }] }));
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-tamper-stage-'));
  assert.throws(() => copyOfficeLiteRuntime(root, stage, copyDirectory), /OFFICE_DEPENDENCY_HASH_MISMATCH/);
});

test('rejects missing files, missing license, symlinks and unconfirmed docx exclusions', () => {
  const sha = value => crypto.createHash('sha256').update(value).digest('hex');
  for (const scenario of ['missing', 'license', 'symlink', 'docx', 'omitted-tamper']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-negative-'));
    const source = path.join(root, 'src/shell/office-lite');
    const name = ['docx', 'omitted-tamper'].includes(scenario) ? 'docx' : 'demo';
    const relative = `node_modules/${name}`;
    const directory = path.join(source, relative);
    fs.mkdirSync(directory, { recursive: true });
    const pkg = JSON.stringify({ name, version: name === 'docx' ? '8.0.0' : '1.0.0',
      ...(name === 'docx' ? { main: scenario === 'docx' ? 'other.js' : 'build/index.js' } : {}), ...(scenario === 'license' ? {} : { license: 'MIT' }) });
    fs.writeFileSync(path.join(source, 'package.json'), '{}');
    fs.writeFileSync(path.join(directory, 'package.json'), pkg);
    if (scenario === 'symlink') fs.symlinkSync('package.json', path.join(directory, 'index.js'));
    else if (scenario !== 'missing') fs.writeFileSync(path.join(directory, 'index.js'), 'ok');
    if (scenario === 'omitted-tamper') {
      fs.mkdirSync(path.join(directory, 'src'));
      fs.writeFileSync(path.join(directory, 'src/deep.ts'), 'changed');
    }
    const version = name === 'docx' ? '8.0.0' : '1.0.0';
    const lock = JSON.stringify({ packages: { '': {}, [relative]: { version, integrity: 'bound' } } });
    fs.writeFileSync(path.join(source, 'package-lock.json'), lock);
    fs.writeFileSync(path.join(source, 'DEPENDENCIES.json'), JSON.stringify({ lockSha256: sha(lock), packages: [{
      path: relative, version, integrity: 'bound', license: 'MIT', files: [
        { path: 'package.json', sha256: sha(pkg) }, { path: 'index.js', sha256: sha('ok') },
        ...(scenario === 'omitted-tamper' ? [{ path: 'src/deep.ts', sha256: sha('original') }] : []),
      ],
    }] }));
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-negative-stage-'));
    const error = { missing: /OFFICE_DEPENDENCY_FILE_MISSING/, license: /OFFICE_DEPENDENCY_LICENSE_MISSING/,
      symlink: /OFFICE_DEPENDENCY_SYMLINK/, docx: /OFFICE_DOCX_EXCLUSION_UNCONFIRMED/,
      'omitted-tamper': /OFFICE_DEPENDENCY_HASH_MISMATCH/ }[scenario];
    assert.throws(() => copyOfficeLiteRuntime(root, stage, copyDirectory), error);
  }
});
