'use strict';

const fs = require('fs');
const path = require('path');

const mvpArgument = process.argv.find(function (argument) { return argument.indexOf('--mvp-id=') === 0; });
const reportArgument = process.argv.find(function (argument) { return argument.indexOf('--report=') === 0; });
const mvpId = mvpArgument ? mvpArgument.slice('--mvp-id='.length) : 'MVP-UNKNOWN';
const reportPath = reportArgument ? reportArgument.slice('--report='.length) : 'C:\\acceptance\\report_spike01_cjk_deploy.json';
const source = 'C:\\acceptance\\mvp_spike01';
const target = 'C:\\测试 目录\\mvp spike01';

function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name);
    const targetPath = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, targetPath);
    else fs.copyFileSync(sourcePath, targetPath);
  }
}

let error = null;
try {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  copyDirectory(source, target);
} catch (exception) {
  error = exception.message;
}

const report = {
  schema_version: 1,
  mvp_id: mvpId,
  suite: 'SPIKE_01_CJK_DEPLOYMENT',
  environment: { platform: process.platform, arch: process.arch },
  artifact_hashes: {},
  command: [process.execPath].concat(process.argv.slice(1)),
  timestamps: { started_at: new Date().toISOString(), finished_at: new Date().toISOString() },
  exit_code: error ? 1 : 0,
  cases: [{
    case_id: 'T05_DEPLOY',
    status: error ? 'FAIL' : 'PASS',
    summary: error ? error : 'Acceptance harness copied to a Chinese-and-space path.',
    metrics: { source: source, target: target, target_exists: fs.existsSync(target) },
    evidence: [],
  }],
  evidence: [],
  notes: [],
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
process.stdout.write('REPORT_WRITTEN:' + reportPath + '\n');
process.exit(report.exit_code);
