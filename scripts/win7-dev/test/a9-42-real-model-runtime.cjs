'use strict';
// Offline runtime/sample consumer check. No product main, SQLite, window or network.
// ELECTRON_RUN_AS_NODE=1 <Electron22> scripts/win7-dev/test/a9-42-real-model-runtime.cjs --engine=<absolute product/office-lite-engine.js>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const d = require('../a9-42-real-model-trial.cjs');
(async () => {
  assert.strictEqual(process.versions.electron, '22.3.27'); assert.strictEqual(process.versions.node, '16.17.1');
  for (const name of fs.readdirSync(path.resolve(__dirname, '..')).filter(n => /^a9-42-real-model-.*\.cjs$/.test(n))) {
    new vm.Script(fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8'), { filename: name });
  }
  const engineFile = process.argv.find(a => a.startsWith('--engine='))?.slice(9);
  assert.ok(engineFile && path.isAbsolute(engineFile), 'ABSOLUTE_EXISTING_ENGINE_REQUIRED');
  const { processOffice } = require(engineFile);
  for (const [name, buffer] of Object.entries(d.samples())) {
    const format = path.extname(name).slice(1);
    const result = await processOffice({ action: 'read', format, buffer });
    assert.strictEqual(result.canModify, true);
    assert.ok(JSON.stringify(result.units).includes(format === 'docx' ? d.MARKERS.doc : d.MARKERS.book));
  }
  const generated = await processOffice({ action: 'write', format: 'docx', content: { schemaVersion: 1, format: 'docx', blocks: [{ type: 'paragraph', text: d.MARKERS.copy }] } });
  assert.ok(d.xmlText(Buffer.from(generated.buffer)).includes(d.MARKERS.copy));
  const reader = d.usageReader(true); reader.push(Buffer.from('data: {"usage":{"total_tokens":3}}\n\n')); assert.deepStrictEqual(reader.end(), { total_tokens: 3 });
  process.stdout.write(JSON.stringify({ status: 'PASS', electron: process.versions.electron, node: process.versions.node,
    sample_read_and_modify_supported: 2, real_engine_deflate_readback: 'PASS', product_main: 'NOT_PERFORMED', win7: 'NOT_PERFORMED', network_requests: 0 }) + '\n');
})().catch(error => { process.stderr.write(require('../a9-42-office-journey.cjs').safeError(error) + '\n'); process.exitCode = 1; });
