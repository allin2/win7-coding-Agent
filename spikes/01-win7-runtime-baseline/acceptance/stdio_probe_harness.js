'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, utilityProcess } = require('electron');

const reportArg = process.argv.find((item) => item.indexOf('--report=') === 0);
const mvpArg = process.argv.find((item) => item.indexOf('--mvp-id=') === 0);
const reportPath = reportArg ? reportArg.slice('--report='.length) : 'C:\\acceptance\\report_spike01_stdio_probe.json';
const mvpId = mvpArg ? mvpArg.slice('--mvp-id='.length) : 'MVP-UNKNOWN';
const variants = [
  { id: 'string_ignore', stdio: 'ignore' },
  { id: 'array_ignore', stdio: ['ignore', 'ignore', 'ignore'] },
  { id: 'array_pipe_stdin', stdio: ['pipe', 'ignore', 'ignore'] },
  { id: 'array_pipe_all', stdio: ['pipe', 'pipe', 'pipe'] },
];
const startedAt = new Date().toISOString();
const results = [];

function sha256(filePath) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
  catch (error) { return 'UNAVAILABLE:' + error.code; }
}

function runVariant(variant) {
  return new Promise(function (resolve) {
    let child;
    try {
      child = utilityProcess.fork(path.join(__dirname, 'stdio_probe_child.js'), [], {
        serviceName: 'mvp-stdio-' + variant.id,
        stdio: variant.stdio,
      });
    } catch (error) {
      resolve({ id: variant.id, stdio: variant.stdio, error: error.message });
      return;
    }
    const parentStdin = child && child.stdin;
    const record = {
      id: variant.id,
      stdio: variant.stdio,
      parent_has_stdin: !!parentStdin,
      parent_stdin_writable: !!(parentStdin && parentStdin.writable),
    };
    let done = false;
    const finish = function (extra) {
      if (done) return;
      done = true;
      Object.assign(record, extra || {});
      try { child.postMessage({ type: 'exit' }); } catch (_) {}
      resolve(record);
    };
    const timeout = setTimeout(function () { finish({ timeout: true }); }, 5000);
    child.on('message', function (message) {
      if (!message || message.type !== 'stdio-observed') return;
      clearTimeout(timeout);
      finish({ observed: message.observed });
    });
    child.on('exit', function (code) {
      if (!done) {
        clearTimeout(timeout);
        finish({ early_exit_code: code });
      }
    });
  });
}

app.on('ready', async function () {
  for (const variant of variants) results.push(await runVariant(variant));
  const report = {
    schema_version: 1,
    mvp_id: mvpId,
    suite: 'SPIKE_01_UTILITY_STDIO_SEMANTICS_PROBE',
    environment: { electron: process.versions.electron, node: process.versions.node, os: process.platform, arch: process.arch },
    artifact_hashes: { harness: sha256(__filename), child: sha256(path.join(__dirname, 'stdio_probe_child.js')), electron_exe: sha256(process.execPath) },
    command: [process.execPath].concat(process.argv.slice(1)),
    timestamps: { started_at: startedAt, finished_at: new Date().toISOString() },
    exit_code: 0,
    cases: results.map(function (result) {
      const noParentInputHandle = result.parent_has_stdin === false;
      return {
        case_id: result.id,
        status: result.error || result.timeout ? 'FAIL' : 'PASS',
        summary: result.error || result.timeout ? 'stdio variant did not complete.' : 'Observed parent-side handle and child-side stream semantics; this probe does not redefine the formal T03 gate.',
        metrics: { parent_has_stdin: result.parent_has_stdin, parent_stdin_writable: result.parent_stdin_writable, child_observed: result.observed || null, no_parent_input_handle: noParentInputHandle },
        evidence: [],
      };
    }),
    evidence: [],
    notes: ['This is a diagnostic semantics probe. It distinguishes a readable NUL-like child stream from an injectable parent-side stdin pipe; formal T03 status remains governed by SPIKE_01.'],
    raw: results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write('REPORT_WRITTEN:' + reportPath + '\n');
  app.quit();
});
