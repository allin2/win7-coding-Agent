#!/usr/bin/env node

import fs from 'fs';
import crypto from 'crypto';
import { GatewayProvider, InMemoryCredentialStore, TLSVersion } from '../../gateway/dist/index.js';

const url = required('--url=');
const caBundlePath = argument('--ca=');
const mode = argument('--mode=') || 'normal';
const expectedError = argument('--expect-error=');
const metricsPath = argument('--metrics=');
const secret = crypto.randomBytes(24).toString('hex');
const credentialStore = new InMemoryCredentialStore();
credentialStore.setApiKey(secret);
const targetProtocol = new URL(url).protocol;
const provider = new GatewayProvider({
  gatewayUrl: url,
  tlsConfig: {
    verifyCertificate: true,
    minTLSVersion: TLSVersion.TLS_1_2,
    ...(caBundlePath ? { caBundle: caBundlePath } : {}),
  },
  credentialStore,
  timeoutMs: mode === 'delay' ? 500 : 5_000,
  totalTimeoutMs: mode === 'delay' ? 1_200 : 15_000,
  retryConfig: { initialDelayMs: 50, maxDelayMs: 100, maxRetries: 2, backoffMultiplier: 2 },
  ...(argument('--proxy-host=') && argument('--proxy-port=') ? {
    proxyConfig: {
      host: argument('--proxy-host='),
      port: Number(argument('--proxy-port=')),
      protocol: 'http',
      ...(argument('--proxy-username=') && argument('--proxy-password=')
        ? { auth: { username: argument('--proxy-username='), password: argument('--proxy-password=') } }
        : {}),
    },
  } : {}),
});
const chunks = [];
let response;
let error;
const startedAt = Date.now();
try {
  response = await provider.sendStreamRequest({
    id: `a3-probe-${Date.now()}`,
    model: 'controlled-a3-model',
    messages: [{ role: 'user', content: 'A3 controlled read-only task' }],
    stream: true,
  }, (chunk) => chunks.push({ index: chunk.index, content: chunk.content }));
} catch (caught) {
  error = { code: caught && caught.code, message: caught && caught.message };
}
provider.disconnect();

const report = {
  schemaVersion: 1,
  suite: 'A3_CONTROLLED_GATEWAY_PROBE',
  generatedAt: new Date().toISOString(),
  mode,
  url: redactUrl(url),
  tls: {
    min: targetProtocol === 'https:' ? 'TLSv1.2' : null,
    verification: targetProtocol === 'https:' ? 'enabled' : 'not-applicable',
    caBundleSha256: caBundlePath ? sha256(caBundlePath) : null,
  },
  response: response ? { id: response.id, finishReason: response.finishReason, content: response.content, toolCallCount: (response.toolCalls || []).length } : null,
  chunks,
  error,
  elapsedMs: Date.now() - startedAt,
  credentialChecks: {
    apiKeyConfiguredInMemory: credentialStore.getApiKey() === secret,
    secretInReport: JSON.stringify({ response, error, chunks }).includes(secret),
    secretInMetrics: metricsPath && fs.existsSync(metricsPath) ? fs.readFileSync(metricsPath, 'utf8').includes(secret) : false,
  },
  status: expectedError ? (error && String(error.code) === expectedError ? 'PASS' : 'FAIL') : (error ? 'FAIL' : 'PASS'),
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
process.exitCode = report.status === 'PASS' ? 0 : 1;

function argument(prefix) {
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}
function required(prefix) {
  const value = argument(prefix);
  if (!value) throw new Error(`Missing ${prefix}<value>`);
  return value;
}
function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function redactUrl(value) {
  try { const parsed = new URL(value); return `${parsed.protocol}//${parsed.host}${parsed.pathname}`; } catch (_error) { return '[invalid-url]'; }
}
