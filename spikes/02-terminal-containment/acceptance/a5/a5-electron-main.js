/**
 * A5 - Win7 Electron 主进程（独立 utilityProcess，不用 ELECTRON_RUN_AS_NODE）
 *
 * 在 Win7 上运行：electron a5-electron-main.js --acceptance-id A5-YYYYMMDD-unique
 *  1. 经 utilityProcess.fork 启动 a5-terminal-host.js（真实 node-pty/winpty，D-011）；
 *  2. 以 HostDriver 驱动 a5-terminal-harness.js 的 T01~T05 / N01~N05；
 *  3. 写结构化证据 JSON，app.exit 0。
 *
 * 本文件只在 Win7 实机 + 授权 lease 下执行；开发机不运行。
 */

'use strict';

const { app, utilityProcess } = require('electron');
const fs = require('fs');
const path = require('path');

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const acceptanceId = argValue('--acceptance-id', `A5-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-000000`);
const outDir = argValue('--out', path.join(__dirname, 'evidence', acceptanceId));
const spikeRoot = path.resolve(__dirname, '..', '..');
const helperPath = argValue('--helper', path.join(spikeRoot, 'spike02_helper.exe'));
const acceptanceRoot = argValue('--acceptance-root', 'C:\\Win7CodingAgent\\acceptance');
const perRunRoot = argValue('--per-run-root', path.join(spikeRoot, 't05-work'));
const leaseId = argValue('--lease-id', '');
const sourceCommit = argValue('--source-commit', '');
const packageManifestSha256 = argValue('--package-manifest-sha256', '');
const t05Only = process.argv.includes('--t05-only');

const { runSuite, testT05 } = require(path.join(__dirname, 'a5-terminal-harness'));
const { HostDriver } = require(path.join(__dirname, 'a5-host-driver'));

app.on('ready', async () => {
  try {
    let result;
    if (t05Only) {
      const t05 = await testT05(null, {
        sourceRoot: spikeRoot, helperPath, acceptanceRoot, perRunRoot, acceptanceId,
      });
      result = { cases: [t05], counts: { [t05.status]: 1 }, formal: { win7_passed: t05.status === 'PASS' ? 1 : 0 } };
    } else {
      const host = utilityProcess.fork(path.join(__dirname, 'a5-terminal-host.js'), [], {
        serviceName: 'a5-terminal-host',
        stdio: 'inherit',
      });
      const driver = new HostDriver(host);
      result = await runSuite({
        driver, sourceRoot: spikeRoot, helperPath, acceptanceRoot, perRunRoot, acceptanceId,
      });
    }
    fs.mkdirSync(outDir, { recursive: true });
    const summary = {
      schema_version: 1,
      acceptance_id: acceptanceId,
      generated_at: new Date().toISOString(),
      mode: t05Only ? 'win7-t05-only' : 'win7',
      evidence_grade: 'CANDIDATE_EVIDENCE',
      lease_id: leaseId,
      source_commit: sourceCommit,
      package_manifest_sha256: packageManifestSha256,
      cases: result.cases,
      counts: result.counts,
      win7_validation: 'COORDINATOR_POSTFLIGHT_PENDING',
    };
    const outFile = path.join(outDir, `a5-${acceptanceId}-win7.json`);
    fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    process.stdout.write(`A5_WIN7_RESULT_WRITTEN ${outFile}\n`);
    app.exit(result.cases.every((item) => item.status === 'PASS' || item.id !== 'T05') ? 0 : 2);
  } catch (error) {
    process.stderr.write(`A5_WIN7_FAILED ${error && error.stack || error}\n`);
    app.exit(2);
  }
});
