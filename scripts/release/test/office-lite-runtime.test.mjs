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

test('copies the real locked Office closure and executes its packaged Worker without source-directory dependencies', async () => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-package-'));
  const rows = copyOfficeLiteRuntime(process.cwd(), stage, copyDirectory);
  assert.ok(rows.length > 0);
  const requireFromStage = createRequire(path.join(stage, 'office-lite/package.json'));
  for (const name of ['docx', 'exceljs', '@xmldom/xmldom', 'jszip']) assert.ok(requireFromStage(name));
  assert.equal(rows.every(row => row.optionalModule === 'office-lite'), true);
  fs.mkdirSync(path.join(stage, 'product'));
  for (const name of ['office-lite-worker.js', 'office-lite-engine.js', 'office-lite-zip.js']) {
    fs.copyFileSync(path.join(process.cwd(), 'src/shell/product', name), path.join(stage, 'product', name));
  }
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(path.join(stage, 'product/office-lite-worker.js'), { workerData: {
      action: 'write', format: 'xlsx', content: { schemaVersion: 1, format: 'xlsx', sheets: [{ name: '包内', rows: [['内容', 1]] }] },
    } });
    let response;
    worker.on('message', value => { response = value; }); worker.on('error', reject);
    worker.on('exit', code => code === 0 ? resolve(response) : reject(new Error('packaged worker failed')));
  });
  assert.equal(result.ok, true); assert.equal(result.result.format, 'xlsx');
  assert.equal(Buffer.from(result.result.buffer).subarray(0, 2).toString(), 'PK');
});

test('rejects modified dependency bytes even when the declared version still matches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-tamper-'));
  const source = path.join(root, 'src/shell/office-lite');
  fs.mkdirSync(path.join(source, 'node_modules/demo'), { recursive: true });
  const bytes = JSON.stringify({ name: 'demo', version: '1.0.0' });
  fs.writeFileSync(path.join(source, 'package.json'), '{}');
  fs.writeFileSync(path.join(source, 'node_modules/demo/package.json'), bytes);
  fs.writeFileSync(path.join(source, 'node_modules/demo/index.js'), 'changed');
  const lock = JSON.stringify({ packages: { '': {}, 'node_modules/demo': { version: '1.0.0', integrity: 'bound' } } });
  fs.writeFileSync(path.join(source, 'package-lock.json'), lock);
  const sha = value => crypto.createHash('sha256').update(value).digest('hex');
  fs.writeFileSync(path.join(source, 'DEPENDENCIES.json'), JSON.stringify({ lockSha256: sha(lock), packages: [{
    path: 'node_modules/demo', version: '1.0.0', integrity: 'bound', files: [
      { path: 'package.json', sha256: sha(bytes) }, { path: 'index.js', sha256: sha('original') },
    ],
  }] }));
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-tamper-stage-'));
  assert.throws(() => copyOfficeLiteRuntime(root, stage, copyDirectory), /OFFICE_DEPENDENCY_HASH_MISMATCH/);
});
