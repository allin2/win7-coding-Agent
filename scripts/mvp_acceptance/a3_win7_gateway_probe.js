'use strict';

/** Direct packaged GatewayProvider probe for A3 Win7 transport acceptance. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const packageRoot = path.resolve(__dirname, '../..');
const gateway = require(path.join(packageRoot, 'gateway/dist'));
const gatewayUrl = required('--url=');
const caBundlePath = argument('--ca=');
const reportPath = path.resolve(argument('--report=') || path.join(__dirname, 'A3-WIN7-gateway-report.json'));
const userDataDir = argument('--user-data-dir=');
const expectedError = argument('--expected-error=');
const cancelAfterMs = numberArgument('--cancel-after-ms=', 0);
const timeoutMs = numberArgument('--timeout-ms=', 30000);
const totalTimeoutMs = numberArgument('--total-timeout-ms=', 90000);
const maxRetries = numberArgument('--max-retries=', 2);
const proxyHost = argument('--proxy-host=');
const proxyPort = numberArgument('--proxy-port=', 0);
const proxyUsername = argument('--proxy-username=');
const proxyPassword = argument('--proxy-password=');

if (userDataDir) app.setPath('userData', path.resolve(userDataDir));

app.whenReady().then(async () => {
  const secret = `a3-memory-${crypto.randomBytes(18).toString('hex')}`;
  const requestId = `a3-win7-${Date.now()}`;
  const controller = new AbortController();
  const chunks = [];
  let response = null;
  let caught = null;
  const startedAt = Date.now();
  let cancelTimer = null;
  const credentialStore = new gateway.InMemoryCredentialStore();
  credentialStore.setApiKey(secret);
  const proxyConfig = proxyHost && proxyPort ? {
    host: proxyHost,
    port: proxyPort,
    protocol: 'http',
    ...(proxyUsername && proxyPassword ? { auth: { username: proxyUsername, password: proxyPassword } } : {}),
  } : undefined;
  const provider = new gateway.GatewayProvider({
    gatewayUrl,
    tlsConfig: {
      verifyCertificate: true,
      minTLSVersion: gateway.TLSVersion.TLS_1_2,
      ...(caBundlePath ? { caBundle: caBundlePath } : {}),
    },
    credentialStore,
    proxyConfig,
    timeoutMs,
    totalTimeoutMs,
    retryConfig: { initialDelayMs: 20, maxDelayMs: 60, maxRetries, backoffMultiplier: 2 },
  });
  try {
    if (cancelAfterMs > 0) {
      cancelTimer = setTimeout(() => controller.abort(), cancelAfterMs);
    }
    response = await provider.sendStreamRequest({
      id: requestId,
      model: 'a3-controlled-fixture',
      messages: [{ role: 'user', content: 'controlled transport acceptance' }],
      stream: true,
    }, (chunk) => chunks.push({ index: chunk.index, content: chunk.content }), { signal: controller.signal });
  } catch (error) {
    caught = { name: error && error.name, code: error && error.code, message: safeMessage(error && error.message, secret) };
  } finally {
    if (cancelTimer) clearTimeout(cancelTimer);
    provider.disconnect();
  }

  const elapsedMs = Date.now() - startedAt;
  const status = expectedError
    ? (caught && String(caught.code) === String(expectedError) ? 'PASS' : 'FAIL')
    : (!caught && Boolean(response) ? 'PASS' : 'FAIL');
  const report = {
    schemaVersion: 1,
    acceptanceId: argument('--acceptance-id=') || 'A3-WIN7-GATEWAY-20260804',
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    gatewayUrl: redactUrl(gatewayUrl),
    transport: new URL(gatewayUrl).protocol.replace(':', ''),
    caBundleConfigured: Boolean(caBundlePath),
    proxy: proxyConfig ? { host: proxyHost, port: proxyPort, credentialsConfigured: Boolean(proxyConfig.auth) } : null,
    requestId,
    elapsedMs,
    cancelAfterMs: cancelAfterMs || null,
    timeoutMs,
    totalTimeoutMs,
    maxRetries,
    chunks,
    response: response ? { finishReason: response.finishReason, contentLength: response.content.length, toolCalls: response.toolCalls?.length || 0 } : null,
    error: caught,
    expectedError: expectedError ? Number(expectedError) : null,
    credentials: { secretInStdout: false, secretInReport: false, secretInError: Boolean(caught && String(caught.message).includes(secret)) },
    status,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  app.exit(status === 'PASS' ? 0 : 1);
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  app.exit(2);
});

function argument(prefix) {
  const value = process.argv.find((item) => item.indexOf(prefix) === 0);
  return value ? value.slice(prefix.length) : null;
}
function required(prefix) {
  const value = argument(prefix);
  if (!value) throw new Error(`Missing ${prefix}<value>`);
  return value;
}
function numberArgument(prefix, fallback) {
  const value = argument(prefix);
  return value === null ? fallback : Number(value);
}
function redactUrl(value) {
  try { const parsed = new URL(value); return `${parsed.protocol}//${parsed.host}${parsed.pathname}`; } catch (_error) { return '[invalid-url]'; }
}
function safeMessage(value, secret) {
  return String(value || '').replaceAll(secret, '[REDACTED]');
}
