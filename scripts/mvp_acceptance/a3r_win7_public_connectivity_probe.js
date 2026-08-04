'use strict';

/** Win7 Electron/Node public TLS probe for DeepSeek. Never accepts a credential. */
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { app } = require('electron');

const reportPath = path.resolve(required('--report='));
const userDataDir = path.resolve(required('--user-data-dir='));
app.setPath('userData', userDataDir);

app.whenReady().then(async () => {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let tls = null;
  let statusCode = 0;
  let error = null;
  try {
    statusCode = await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: 'api.deepseek.com',
        port: 443,
        path: '/models',
        method: 'GET',
        headers: { accept: 'application/json', 'user-agent': 'win7-coding-agent-a3r-connectivity' },
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        timeout: 15_000,
      }, (response) => {
        let bytes = 0;
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 65_536) response.destroy();
        });
        response.on('end', () => resolve(response.statusCode || 0));
      });
      request.on('socket', (socket) => {
        socket.once('secureConnect', () => {
          const certificate = socket.getPeerCertificate();
          tls = {
            protocol: socket.getProtocol(),
            authorized: socket.authorized,
            authorizationError: socket.authorizationError || null,
            peerCertificate: certificate ? {
              subjectCN: certificate.subject && certificate.subject.CN,
              issuerCN: certificate.issuer && certificate.issuer.CN,
              fingerprint256: certificate.fingerprint256 || null,
              validTo: certificate.valid_to || null,
              rawSha256: certificate.raw ? crypto.createHash('sha256').update(certificate.raw).digest('hex') : null,
            } : null,
          };
        });
      });
      request.on('timeout', () => request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
      request.on('error', reject);
      request.end();
    });
  } catch (caught) {
    error = { code: caught && caught.code, name: caught && caught.name, message: String(caught && caught.message || caught) };
  }
  const acceptableStatus = [200, 401, 403].includes(statusCode);
  const report = {
    schemaVersion: 1,
    acceptanceId: 'A3R-WIN7-PUBLIC-CONNECTIVITY-20260804',
    environment: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      userDataDir,
    },
    target: 'https://api.deepseek.com:443/models',
    request: { method: 'GET', authorizationHeaderPresent: false },
    response: { statusCode, bodyPersisted: false },
    tls,
    elapsedMs: Date.now() - startedMs,
    timestamps: { startedAt, finishedAt: new Date().toISOString() },
    error,
    status: !error && acceptableStatus && tls && tls.authorized === true && ['TLSv1.2', 'TLSv1.3'].includes(tls.protocol) ? 'PASS' : 'FAIL',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  app.exit(report.status === 'PASS' ? 0 : 1);
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
