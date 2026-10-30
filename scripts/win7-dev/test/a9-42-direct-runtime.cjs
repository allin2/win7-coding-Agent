'use strict';
// Actual Electron22/Node16 transport smoke. Only a local HTTP fixture is reachable.
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const assert = require('assert');
const d = require('../a9-42-real-model-direct.cjs');
const { safeError } = require('../a9-42-office-journey.cjs');
const { OpenAICompatibleProvider } = require('../../../src/gateway/dist');
const { a9ToolSpecs } = require('../../../src/core/dist/a9-tools');
const output = process.argv.find(a => a.startsWith('--output='))?.slice(9);
assert(output && path.isAbsolute(output) && !fs.existsSync(output), 'NEW_OUTPUT_REQUIRED');
fs.mkdirSync(output, { recursive: true });
const report = { evidence_class: 'DEVELOPMENT_ELECTRON_NODE16_LOOPBACK',
  node: process.versions.node, electron: process.versions.electron, platform: process.platform,
  win7: 'NOT_PERFORMED', real_dpapi: 'NOT_PERFORMED', external_network: 'NOT_PERFORMED', checks: [] };
const original = http.request;
http.request = function(o, ...args) { assert.strictEqual(o.hostname, '127.0.0.1', 'EXTERNAL_NETWORK_FORBIDDEN'); return Reflect.apply(original, this, [o, ...args]); };
https.request = () => { throw new Error('EXTERNAL_NETWORK_FORBIDDEN'); };
const key = 'TEST_ONLY_NODE16_KEY';
const sockets = new Set(); let guard, forwarded = 0;
const server = http.createServer((req, res) => {
  forwarded++; assert.strictEqual(req.headers.authorization, 'Bearer ' + key);
  let body = ''; req.on('data', b => body += b.toString('utf8')); req.once('end', () => {
    const options = JSON.parse(body).tools.find(t => t.function.name === 'ask_user').function.parameters.properties.options;
    assert.strictEqual(options.type, 'array'); assert.deepStrictEqual(options.items, { type: 'string', maxLength: 200 });
    assert.strictEqual(options.maxItems, 6); assert.strictEqual(options.maxLength, undefined);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"actual-stream"},"finish_reason":null}]}\n\n');
    res.end('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":9}}\n\ndata: [DONE]\n\n');
  });
});
server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
const timer = setTimeout(() => { if (guard) guard.stop(); for (const s of sockets) s.destroy(); }, 10000);
(async () => {
  try {
    assert.strictEqual(report.electron, '22.3.27'); assert.strictEqual(report.node, '16.17.1');
    await new Promise(r => server.listen(0, '127.0.0.1', r)); const url = 'http://127.0.0.1:' + server.address().port;
    guard = d.installDirectGuard({ limit: 1, deadline: Date.now() + 5000 }, url);
    const provider = new OpenAICompatibleProvider({ baseUrl: url + '/v1', model: 'fixture', apiKey: key, retryConfig: { maxRetries: 0 } });
    const tools = a9ToolSpecs('full_access').map(t => ({ name: t.name, description: t.description, parameters: t.inputSchema }));
    let chunks = 0;
    await provider.sendStreamRequest({ id: 'node16', messages: [{ role: 'user', content: 'fixture' }], tools }, () => chunks++);
    await new Promise(r => setImmediate(r)); guard.assertEvidence(); assert(chunks > 0);
    assert.deepStrictEqual(guard.state.records[0].usage, { total_tokens: 9 });
    report.checks.push({ name: 'current_gateway_incremental_stream_and_usage', status: 'PASS' });
    report.checks.push({ name: 'actual_core_ask_user_standard_json_schema', status: 'PASS' });
    await assert.rejects(provider.sendStreamRequest({ id: 'blocked', messages: [{ role: 'user', content: 'fixture' }] }, () => {}));
    assert.strictEqual(forwarded, 1); assert.strictEqual(guard.state.requests, 1); assert.strictEqual(guard.state.blocked, 1);
    report.checks.push({ name: 'request_cap_before_original_transport', status: 'PASS' });
    assert.strictEqual(guard.scanSecrets(guard.state), true); assert.strictEqual(guard.scanSecrets({ key }), false);
    report.checks.push({ name: 'metadata_only_and_exact_credential_scan', status: 'PASS' }); report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.error = safeError(error); process.exitCode = 1; }
  finally {
    clearTimeout(timer); if (guard) guard.restore(); for (const s of sockets) s.destroy();
    await new Promise(r => server.close(r));
    fs.writeFileSync(path.join(output, 'RESULT.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify(report) + '\n');
  }
})();
