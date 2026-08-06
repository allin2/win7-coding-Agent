/*
 * A4 Execution Beta helper harness.
 *
 * Dynamic cases run only on Windows with a built helper. On other hosts this
 * script records BUILD_HOST_MISSING and exits non-zero; it never substitutes a
 * macOS process result for Win7 evidence.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const acceptanceId = process.argv.includes('--acceptance-id')
  ? process.argv[process.argv.indexOf('--acceptance-id') + 1]
  : 'A4-20260805-01';
const helperPath = process.argv.includes('--helper')
  ? path.resolve(process.argv[process.argv.indexOf('--helper') + 1])
  : path.resolve(__dirname, '..', 'helper', 'build-a4', 'Release', 'spike02_helper.exe');
const outputPath = process.argv.includes('--out')
  ? path.resolve(process.argv[process.argv.indexOf('--out') + 1])
  : null;
const keep = process.argv.includes('--keep');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runSync(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    command,
    args,
    exit_code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error) : null,
  };
}

class HelperClient {
  constructor(binary) {
    this.child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.buffer = '';
    this.pending = [];
    this.stderr = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let newline;
      while ((newline = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newline).replace(/\r$/, '');
        this.buffer = this.buffer.slice(newline + 1);
        if (!line) continue;
        const waiter = this.pending.shift();
        if (waiter) {
          try { waiter.resolve(JSON.parse(line)); }
          catch (error) { waiter.reject(new Error(`invalid helper response: ${error.message}`)); }
        }
      }
    });
    this.child.stderr.on('data', (chunk) => { this.stderr += chunk; });
  }

  send(request) {
    this.child.stdin.write(`${JSON.stringify(request)}\n`, 'utf8');
  }

  nextResponse(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      };
      const timer = setTimeout(() => {
        const index = this.pending.indexOf(waiter);
        if (index !== -1) this.pending.splice(index, 1);
        reject(new Error(`helper response timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.push(waiter);
    });
  }

  async request(request, timeoutMs = 10000) {
    const response = this.nextResponse(timeoutMs);
    this.send(request);
    return response;
  }

  async close() {
    if (!this.child.killed) this.child.stdin.end();
    await new Promise((resolve) => {
      const timer = setTimeout(() => { this.child.kill(); resolve(); }, 5000);
      this.child.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }
}

function caseRecord(id, expected, actual, extra = {}) {
  const pass = expected(actual);
  return { id, status: pass ? 'PASS' : 'FAIL', expected: extra.expected || null, actual, ...extra };
}

async function runDynamic() {
  const windir = process.env.WINDIR || 'C:\\Windows';
  const system32 = path.win32.join(windir, 'System32');
  const cmd = path.win32.join(system32, 'cmd.exe');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-runner-')); 
  const testRoot = path.join(tempRoot, '中文 acceptance path');
  fs.mkdirSync(testRoot, { recursive: true });
  const scriptPath = (name) => path.win32.join(testRoot, name);
  const localScript = (name, content) => {
    const file = path.join(testRoot, name);
    fs.writeFileSync(file, content.replace(/\n/g, '\r\n'), 'utf8');
    return file;
  };
  localScript('echo.cmd', '@echo off\necho 中文 path ok\n');
  localScript('flood.cmd', '@echo off\nfor /l %%i in (1,1,100000) do @echo 1234567890\n');
  localScript('tree.cmd', '@echo off\nstart "" /b "%ComSpec%" /d /s /c "ping 127.0.0.1 -n 60 >nul"\nping 127.0.0.1 -n 60 >nul\n');

  const client = new HelperClient(helperPath);
  const cases = [];
  try {
    cases.push(caseRecord('C01-version', (value) => value.exit_code === 0 && /win7-x64/.test(value.stdout),
      runSync(helperPath, ['--version']), { expected: 'helper --version exits 0 and identifies Win7 x64' }));
    cases.push(caseRecord('C02-help', (value) => value.exit_code === 0 && /stdin/.test(value.stdout),
      runSync(helperPath, ['--help']), { expected: 'helper --help is side-effect free' }));

    const unknown = await client.request({ requestId: 'unknown-command', executable: path.win32.join(system32, 'powershell.exe'), argv: ['-NoProfile'], workingDirectory: testRoot });
    cases.push(caseRecord('N01-unknown-command', (value) => value.error === 'ARGV_REJECTED', unknown,
      { expected: 'unknown executable is rejected before CreateProcess' }));

    const where = await client.request({ requestId: 'structured-argv', executable: path.win32.join(system32, 'where.exe'), argv: ['cmd.exe'], workingDirectory: testRoot });
    cases.push(caseRecord('C03-structured-argv', (value) => value.type === 'execution_result' && value.status === 'completed' && value.containmentVerified && value.inputDetached, where,
      { expected: 'structured argv executes inside verified Job Object with detached stdin' }));

    const cjk = await client.request({ requestId: 'cjk-space-path', executable: cmd, argv: ['/d', '/s', '/c', scriptPath('echo.cmd')], workingDirectory: testRoot });
    cases.push(caseRecord('C04-cjk-space-path', (value) => value.status === 'completed' && value.containmentVerified && value.inputDetached, cjk,
      { expected: 'Chinese and space working directory/script path completes' }));

    const outputLimit = await client.request({ requestId: 'output-limit', executable: cmd, argv: ['/d', '/s', '/c', scriptPath('flood.cmd')], workingDirectory: testRoot, maxOutputSize: 256, timeoutMs: 5000 });
    cases.push(caseRecord('C05-output-limit', (value) => value.status === 'output_limit' && value.outputTruncated && value.containmentVerified, outputLimit,
      { expected: 'output flood is bounded and the Job Object is used for termination' }));

    const timeout = await client.request({ requestId: 'timeout-tree', executable: cmd, argv: ['/d', '/s', '/c', scriptPath('tree.cmd')], workingDirectory: testRoot, timeoutMs: 300 });
    await sleep(500);
    const snapshotAfterTimeout = runSync('tasklist.exe', ['/fo', 'csv']);
    cases.push(caseRecord('C06-timeout-process-tree', (value) => value.status === 'timed_out' && value.timedOut && value.containmentVerified, timeout,
      { expected: 'timeout uses TerminateJobObject and records verified containment', process_snapshot_after: snapshotAfterTimeout }));

    const cancelAckPromise = client.nextResponse(10000);
    const canceledPromise = client.nextResponse(10000);
    client.send({ requestId: 'cancel-tree', executable: cmd, argv: ['/d', '/s', '/c', scriptPath('tree.cmd')], workingDirectory: testRoot, timeoutMs: 10000 });
    await sleep(200);
    client.send({ op: 'cancel', requestId: 'cancel-tree' });
    const cancelAck = await cancelAckPromise;
    const canceled = await canceledPromise;
    cases.push(caseRecord('C07-explicit-cancel', (value) => cancelAck.status === 'cancel_requested' && value.status === 'canceled' && value.canceled && value.containmentVerified, canceled,
      { expected: 'explicit cancel reaches the active request and kills its Job tree', cancel_ack: cancelAck }));

    const malformed = await client.request({ requestId: 'bad-meta', executable: cmd, argv: ['/d', '/s', '/c', scriptPath('echo.cmd')], workingDirectory: testRoot, maxOutputSize: 64, timeoutMs: 1000 });
    cases.push(caseRecord('N02-bounded-config', (value) => value.status === 'completed' && value.stdoutSize <= 64, malformed,
      { expected: 'bounded config remains structured after repeated requests' }));
  } finally {
    await client.close();
    if (!keep) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return cases;
}

async function main() {
  const record = {
    schema_version: 1,
    acceptance_id: acceptanceId,
    suite: 'A4_EXECUTION_BETA_HELPER',
    captured_at: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, release: os.release(), node: process.version },
    target: { os: 'Windows 7 SP1 x64 build 7601', helper: helperPath },
    artifact: fs.existsSync(helperPath) ? { path: helperPath, sha256: sha256(helperPath) } : null,
    cases: [],
    status: 'BUILD_HOST_MISSING',
    formal_win7_validation: 'NOT_PERFORMED',
  };
  const finish = (code) => {
    record.exit_code = code;
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    }
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    process.exitCode = code;
  };
  if (process.platform !== 'win32' || !fs.existsSync(helperPath)) {
    record.reason = process.platform !== 'win32'
      ? 'dynamic helper harness is intentionally not substituted on a non-Windows host'
      : 'helper PE/COFF artifact is missing';
    finish(2);
    return;
  }
  record.cases = await runDynamic();
  record.not_performed = [{ id: 'C08-host-already-in-job', status: 'NOT_PERFORMED', reason: 'requires a controlled Win7 launcher Job Object' }];
  record.status = record.cases.every((item) => item.status === 'PASS') ? 'PARTIAL' : 'FAIL';
  record.formal_win7_validation = record.status;
  finish(record.status === 'PARTIAL' ? 0 : 1);
}

main()
  .then(() => {
    if (process.versions.electron) process.exit(process.exitCode || 0);
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    if (process.versions.electron) process.exit(1);
    process.exitCode = 1;
  });
