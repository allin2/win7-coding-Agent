'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const electron = require('electron');
const { app, BrowserWindow, crashReporter, ipcMain, utilityProcess, net } = electron;

const args = process.argv.slice(2);
const reportArgument = args.find(function (argument) { return argument.indexOf('--report=') === 0; });
const mvpArgument = args.find(function (argument) { return argument.indexOf('--mvp-id=') === 0; });
const durationArgument = args.find(function (argument) { return argument.indexOf('--idle-duration-ms=') === 0; });
const secondInstanceProbe = args.indexOf('--second-instance-probe') !== -1;
const reportPath = reportArgument ? reportArgument.slice('--report='.length) : 'C:\\acceptance\\report_spike01_formal.json';
const mvpId = mvpArgument ? mvpArgument.slice('--mvp-id='.length) : 'MVP-UNKNOWN';
const idleDurationMs = durationArgument ? Math.max(1000, Number(durationArgument.slice('--idle-duration-ms='.length))) : 600000;
const startedAt = new Date().toISOString();
const userDataPath = path.join('C:\\acceptance', 'mvp_spike01_userdata_' + mvpId);
const results = [];
const raw = { network_requests: [], memory_samples: [], lifecycle: [] };
let mainWindow = null;
let secondInstanceObserved = false;
let rendererPayload = null;

function sha256(filePath) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
  catch (error) { return 'UNAVAILABLE:' + error.code; }
}

function add(caseId, status, summary, metrics, evidence) {
  results.push({
    case_id: caseId,
    status: status,
    summary: summary,
    metrics: metrics || {},
    evidence: evidence || [],
  });
}

function snapshotElectronProcesses() {
  const result = childProcess.spawnSync('wmic', ['process', 'where', "name='electron.exe'", 'get', 'ProcessId,CommandLine', '/format:csv'], {
    shell: false, encoding: 'utf8', timeout: 15000, windowsHide: true,
  });
  return { exit_code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function snapshotProcessMemory(pid) {
  const result = childProcess.spawnSync('wmic', [
    'process',
    'where',
    'ProcessId=' + String(pid),
    'get',
    'WorkingSetSize,PrivatePageCount,ProcessId',
    '/format:list',
  ], { shell: false, encoding: 'utf8', timeout: 15000, windowsHide: true });
  const values = {};
  String(result.stdout || '').split(/\r?\n/).forEach(function (line) {
    const separator = line.indexOf('=');
    if (separator <= 0) return;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  });
  return {
    pid: pid,
    exit_code: result.status,
    working_set_bytes: Number(values.WorkingSetSize) || null,
    private_page_bytes: Number(values.PrivatePageCount) || null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function finalize(exitCode) {
  const report = {
    schema_version: 1,
    mvp_id: mvpId,
    suite: 'SPIKE_01_WIN7_RUNTIME_BASELINE_FORMAL_AUTOMATION',
    environment: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      os: process.platform,
      arch: process.arch,
      user_data: userDataPath,
    },
    artifact_hashes: {
      harness: sha256(__filename),
      preload: sha256(path.join(__dirname, 'codex_formal_preload.js')),
      renderer: sha256(path.join(__dirname, 'codex_formal_renderer.js')),
      utility_child: sha256(path.join(__dirname, 'codex_formal_utility_child.js')),
      electron_exe: sha256(process.execPath),
    },
    command: [process.execPath].concat(process.argv.slice(1)),
    timestamps: { started_at: startedAt, finished_at: new Date().toISOString() },
    exit_code: exitCode,
    cases: results,
    evidence: [],
    notes: [
      'T01 is process-cold-start automation unless a separately recorded OS reboot run is attached.',
      'T04 and window-focus portion of T06 require human visual review and are not represented as automated PASS.',
      'T08 records application-layer cancellation; packet capture or local listener evidence is required for a formal network conclusion.',
    ],
    raw: raw,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write('REPORT_WRITTEN:' + reportPath + '\n');
  app.quit();
  setTimeout(function () { process.exit(exitCode); }, 250);
}

if (args.indexOf('--disable-gpu') !== -1) {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

if (!app.requestSingleInstanceLock()) {
  if (secondInstanceProbe) {
    process.stdout.write('SECOND_INSTANCE_LOCK_REJECTED\n');
    process.exit(0);
  }
  process.exit(2);
}

app.on('second-instance', function () {
  secondInstanceObserved = true;
  raw.lifecycle.push({ event: 'second-instance', at: new Date().toISOString() });
});

ipcMain.handle('mvp:report', function (_event, payload) {
  rendererPayload = payload;
  return { accepted: true };
});

function testUtility() {
  return new Promise(function (resolve) {
    if (!utilityProcess || typeof utilityProcess.fork !== 'function') {
      add('T03', 'FAIL', 'utilityProcess.fork is unavailable.', {}, []);
      resolve();
      return;
    }
    const utility = utilityProcess.fork(path.join(__dirname, 'codex_formal_utility_child.js'), [], {
      serviceName: 'mvp-spike01-utility',
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    let settled = false;
    const memorySamples = [];
    const collectMemory = function (pid) {
      memorySamples.push(snapshotProcessMemory(pid));
    };
    const timeout = setTimeout(function () {
      if (!settled) {
        settled = true;
        add('T03', 'FAIL', 'utilityProcess did not return readiness data within timeout.', {}, []);
        resolve();
      }
    }, 20000);
    utility.on('message', function (message) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      collectMemory(message && message.pid);
      setTimeout(function () { collectMemory(message && message.pid); }, 500);
      setTimeout(function () {
        collectMemory(message && message.pid);
        const stdinClosed = message && message.stdin && message.stdin.readable === false;
        const residentSamples = memorySamples.filter(function (sample) {
          return sample.working_set_bytes > 0 || sample.private_page_bytes > 0;
        });
        const details = Object.assign({}, message || {}, {
          stdin_closed: stdinClosed,
          memory_samples: memorySamples,
          resident_sample_count: residentSamples.length,
        });
        const status = stdinClosed && residentSamples.length >= 1 ? 'PASS' : (stdinClosed ? 'PARTIAL' : 'FAIL');
        add('T03', status, status === 'PASS' ? 'Utility process remained alive long enough to provide closed-stdin and Win7 working-set/private-page evidence.' : 'Utility process started but resident-memory or closed-stdin evidence was incomplete.', details, []);
        try { utility.postMessage({ type: 'exit' }); } catch (_) {}
        resolve();
      }, 1000);
    });
    utility.on('exit', function (code) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        add('T03', 'FAIL', 'Utility process exited before readiness message.', { exit_code: code }, []);
        resolve();
      }
    });
  });
}

function testSecondInstance() {
  return new Promise(function (resolve) {
    const before = snapshotElectronProcesses();
    const probe = childProcess.spawn(process.execPath, [__filename, '--second-instance-probe'], {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    probe.stdout.on('data', function (chunk) { stdout += chunk.toString('utf8'); });
    probe.stderr.on('data', function (chunk) { stderr += chunk.toString('utf8'); });
    const timeout = setTimeout(function () { try { probe.kill(); } catch (_) {} }, 15000);
    probe.on('exit', function (code) {
      clearTimeout(timeout);
      const after = snapshotElectronProcesses();
      const passed = code === 0 && secondInstanceObserved && stdout.indexOf('SECOND_INSTANCE_LOCK_REJECTED') !== -1;
      add('T06', passed ? 'PARTIAL' : 'FAIL', passed ? 'Second instance was rejected and primary received the event; visual focus remains owner-accepted.' : 'Second-instance protocol did not complete.', {
        probe_exit_code: code,
        primary_received_event: secondInstanceObserved,
        probe_stdout: stdout,
        probe_stderr: stderr,
        before: before,
        after: after,
      }, []);
      resolve();
    });
  });
}

function testSessionNetworkBlock() {
  const targets = ['http://192.168.1.10:37124/mvp-session-probe', 'http://mvp-win7-invalid.invalid/'];
  return Promise.all(targets.map(function (target) {
    return new Promise(function (resolve) {
      let settled = false;
      const finish = function (outcome) {
        if (settled) return;
        settled = true;
        resolve({ target: target, outcome: outcome });
      };
      try {
        const request = net.request({ method: 'GET', url: target, session: mainWindow.webContents.session });
        request.on('response', function () { finish('unexpected-response'); });
        request.on('error', function (error) { finish('rejected:' + error.message); });
        request.end();
        setTimeout(function () { finish('timeout'); }, 5000);
      } catch (error) {
        finish('rejected:' + error.message);
      }
    });
  }));
}

function testConcurrentUtilities() {
  return new Promise(function (resolve) {
    if (!utilityProcess || typeof utilityProcess.fork !== 'function') {
      resolve({ started: 0, workers: [] });
      return;
    }
    const workers = [];
    let settled = 0;
    const complete = function () {
      if (settled !== 2) return;
      resolve({ started: workers.length, workers: workers });
    };
    for (let index = 0; index < 2; index += 1) {
      const worker = utilityProcess.fork(path.join(__dirname, 'codex_formal_utility_child.js'), [], {
        serviceName: 'mvp-spike01-concurrent-' + index,
        stdio: 'ignore',
      });
      const record = { index: index, ready: false, done: false, message: null };
      workers.push(record);
      const settleWorker = function () {
        if (record.done) return;
        record.done = true;
        settled += 1;
        complete();
      };
      const timeout = setTimeout(function () {
        settleWorker();
      }, 15000);
      worker.on('message', function (message) {
        if (record.ready) return;
        record.ready = true;
        record.message = message;
        clearTimeout(timeout);
        try { worker.postMessage({ type: 'exit' }); } catch (_) {}
        settleWorker();
      });
      worker.on('exit', function () {
        if (!record.ready) {
          clearTimeout(timeout);
          settleWorker();
        }
      });
    }
  });
}

function testCrashArtifacts() {
  return new Promise(function (resolve) {
    const crashDir = path.join(userDataPath, 'CrashDumps');
    const crashpadReportsDir = path.join(userDataPath, 'Crashpad', 'reports');
    const logPath = path.join(userDataPath, 'crash-events.jsonl');
    try { fs.mkdirSync(crashDir, { recursive: true }); } catch (_) {}
    const crashWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    let gone = false;
    crashWindow.webContents.once('render-process-gone', function (_event, details) {
      gone = true;
      fs.appendFileSync(logPath, JSON.stringify({ event: 'render-process-gone', details: details, at: new Date().toISOString() }) + '\n', 'utf8');
    });
    crashWindow.loadURL('data:text/html,<html><body>crash</body></html>').then(function () {
      try { crashWindow.webContents.forcefullyCrashRenderer(); }
      catch (error) { fs.appendFileSync(logPath, JSON.stringify({ event: 'crash-call-failed', message: error.message }) + '\n', 'utf8'); }
    });
    setTimeout(function () {
      const dumps = [];
      for (const directory of [crashDir, crashpadReportsDir]) {
        if (!fs.existsSync(directory)) continue;
        for (const file of fs.readdirSync(directory)) dumps.push(path.join(directory, file));
      }
      const status = gone && dumps.length > 0 ? 'PASS' : (gone ? 'PARTIAL' : 'FAIL');
      add('T09', status, status === 'PASS' ? 'Renderer crash produced lifecycle event and dump artifact.' : (gone ? 'Renderer crash event observed but no dump artifact found.' : 'Renderer crash lifecycle event was not observed.'), {
        render_process_gone: gone,
        crash_dump_count: dumps.length,
        crash_dir: crashDir,
        crashpad_reports_dir: crashpadReportsDir,
        structured_log: logPath,
      }, [logPath].concat(dumps));
      try { crashWindow.destroy(); } catch (_) {}
      resolve();
    }, 5000);
  });
}

function sampleMemoryForIdleWindow() {
  return new Promise(function (resolve) {
    const sample = function () {
      return process.getProcessMemoryInfo().then(function (memory) {
        raw.memory_samples.push({ at: new Date().toISOString(), memory: memory });
      }).catch(function (error) {
        raw.memory_samples.push({ at: new Date().toISOString(), error: error.message });
      });
    };
    const intervalMs = Math.min(60000, Math.max(1000, Math.floor(idleDurationMs / 10)));
    let remaining = 10;
    const timer = setInterval(function () {
      sample().then(function () {
        remaining -= 1;
        if (remaining === 0) {
          clearInterval(timer);
          const privateKb = raw.memory_samples.map(function (item) { return item.memory && item.memory.private; }).filter(function (value) { return typeof value === 'number'; });
          const averagePrivateKb = privateKb.length ? privateKb.reduce(function (sum, value) { return sum + value; }, 0) / privateKb.length : null;
          add('T02', privateKb.length === 10 ? 'PASS' : 'PARTIAL', privateKb.length === 10 ? 'Collected ten idle-memory samples.' : 'Idle-memory sampling was incomplete.', {
            requested_duration_ms: idleDurationMs,
            sample_count: privateKb.length,
            average_private_kb: averagePrivateKb,
          }, []);
          resolve();
        }
      });
    }, intervalMs);
  });
}

app.on('ready', async function () {
  app.setPath('userData', userDataPath);
  crashReporter.start({ submitURL: '', uploadToServer: false, compress: true });
  app.setPath('crashDumps', path.join(userDataPath, 'CrashDumps'));

  add('T01', 'PARTIAL', 'This run measures a process cold start only; no OS reboot evidence is attached.', {
    electron: process.versions.electron,
    expected_electron: '22.3.27',
    version_matches: process.versions.electron === '22.3.27',
  }, []);

  mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'codex_formal_preload.js'),
    },
  });
  mainWindow.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, function (details, callback) {
    raw.network_requests.push({ url: details.url, resource_type: details.resourceType, cancelled: true, at: new Date().toISOString() });
    callback({ cancel: true });
  });
  mainWindow.webContents.setWindowOpenHandler(function () { return { action: 'deny' }; });
  mainWindow.webContents.session.setPermissionRequestHandler(function (_contents, _permission, callback) { callback(false); });

  await mainWindow.loadFile(path.join(__dirname, 'codex_formal_renderer.html'));
  await new Promise(function (resolve) { setTimeout(resolve, 300); });
  const rendererPass = rendererPayload && rendererPayload.require_unavailable && rendererPayload.process_unavailable && rendererPayload.buffer_unavailable && rendererPayload.preload_api_present && rendererPayload.forbidden_ipc_rejected;
  add('T07', rendererPass ? 'PASS' : 'FAIL', rendererPass ? 'Renderer isolation and forbidden IPC checks passed.' : 'Renderer isolation or forbidden IPC checks failed.', rendererPayload || {}, []);
  const sessionAttempts = await testSessionNetworkBlock();
  const websocketRejected = rendererPayload && rendererPayload.network_attempts.some(function (attempt) { return attempt.target.indexOf('ws://') === 0 && attempt.outcome !== 'unexpected-success'; });
  const interceptedHttpRequests = raw.network_requests.length >= 2 && raw.network_requests.every(function (request) { return request.cancelled; });
  const networkPass = rendererPayload && rendererPayload.csp_inline_blocked && websocketRejected && interceptedHttpRequests && sessionAttempts.every(function (attempt) { return attempt.outcome.indexOf('unexpected-response') !== 0; });
  add('T08', networkPass ? 'MVP_NETWORK_SURROGATE' : 'FAIL', networkPass ? 'Application-layer CSP/session cancellation rejected HTTP and DNS probes, and the renderer WebSocket probe was rejected. Electron did not expose the renderer WebSocket attempt to this session callback; packet capture is not attached.' : 'Network blocking evidence was incomplete.', {
    renderer_attempts: rendererPayload ? rendererPayload.network_attempts : [],
    session_attempts: sessionAttempts,
    intercepted_requests: raw.network_requests,
    websocket_rejected: websocketRejected,
    intercepted_http_requests: interceptedHttpRequests,
  }, []);
  const gpuInfo = await app.getGPUInfo('basic').catch(function (error) { return { error: error.message }; });
  add('T04', 'OWNER_ACCEPTED_FOR_MVP', 'GPU switch and GPU information were collected; black-screen/UI usability requires deferred visual review.', {
    disable_gpu: app.commandLine.hasSwitch('disable-gpu'),
    gpu_info: gpuInfo,
  }, []);

  await testUtility();
  await testSecondInstance();
  await testCrashArtifacts();
  await sampleMemoryForIdleWindow();

  const concurrentUtilities = await testConcurrentUtilities();
  const finalSnapshot = snapshotElectronProcesses();
  add('T10', 'PARTIAL', 'Per-run userData path is isolated; external cleanup/reinspection is required after this process exits.', {
    user_data: userDataPath,
    before_cleanup_process_snapshot: finalSnapshot,
  }, []);
  add('T11', concurrentUtilities.started === 2 && concurrentUtilities.workers.every(function (worker) { return worker.ready; }) ? 'PARTIAL' : 'FAIL', 'Two utility processes were started and sampled; workload simulation remains deferred.', {
    shell_memory_samples: raw.memory_samples.length,
    concurrent_utilities: concurrentUtilities,
  }, []);
  finalize(0);
});

setTimeout(function () {
  if (results.length === 0) {
    add('HARNESS', 'FAIL', 'Harness timed out before Electron ready.', {}, []);
    finalize(1);
  }
}, idleDurationMs + 90000);
