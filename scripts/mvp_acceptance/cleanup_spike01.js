'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const mvpArgument = process.argv.find(function (argument) { return argument.indexOf('--mvp-id=') === 0; });
const reportArgument = process.argv.find(function (argument) { return argument.indexOf('--report=') === 0; });
const deploymentArgument = process.argv.find(function (argument) { return argument.indexOf('--deployment=') === 0; });
const userDataArgument = process.argv.find(function (argument) { return argument.indexOf('--user-data=') === 0; });
const mvpId = mvpArgument ? mvpArgument.slice('--mvp-id='.length) : 'MVP-UNKNOWN';
const reportPath = reportArgument ? reportArgument.slice('--report='.length) : 'C:\\acceptance\\report_spike01_cleanup.json';
const deploymentPath = deploymentArgument ? deploymentArgument.slice('--deployment='.length) : 'C:\\acceptance\\mvp_spike01';
const cjkDeploymentPath = 'C:\\测试 目录\\mvp spike01';
const userDataPath = userDataArgument ? userDataArgument.slice('--user-data='.length) : path.join('C:\\acceptance', 'mvp_spike01_userdata_' + mvpId);
const processToken = path.basename(deploymentPath).toLowerCase();

function command(commandName, args) {
  const result = childProcess.spawnSync(commandName, args, {
    shell: false, encoding: 'utf8', timeout: 15000, windowsHide: true,
  });
  return { exit_code: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error ? result.error.message : null };
}

function relevantProcesses() {
  const result = command('wmic', ['process', 'where', "CommandLine like '%" + processToken + "%'", 'get', 'ProcessId,CommandLine', '/format:csv']);
  const lines = result.stdout.split(/\r?\n/);
  const matching = lines.filter(function (line) {
    const normalized = line.toLowerCase();
    return normalized.indexOf(processToken) !== -1 && normalized.indexOf('wmic process where') === -1 && normalized.indexOf('cleanup_spike01.js') === -1;
  });
  return Object.assign(result, { matching_process_lines: matching });
}

function startupReferences() {
  const result = command('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run']);
  const containsDeployment = result.stdout.toLowerCase().indexOf(processToken) !== -1;
  return { exit_code: result.exit_code, contains_mvp_reference: containsDeployment, stderr: result.stderr, error: result.error };
}

const before = relevantProcesses();
const startupBefore = startupReferences();
const removals = [];
for (const target of [userDataPath, deploymentPath, cjkDeploymentPath]) {
  try {
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    removals.push({ path: target, exists_after: fs.existsSync(target) });
  } catch (error) {
    removals.push({ path: target, error: error.message, exists_after: fs.existsSync(target) });
  }
}
const after = relevantProcesses();
const startupAfter = startupReferences();
const processCleared = after.matching_process_lines.length === 0;
const pathsRemoved = removals.every(function (item) { return item.exists_after === false; });
const startupClean = !startupBefore.contains_mvp_reference && !startupAfter.contains_mvp_reference;
const report = {
  schema_version: 1,
  mvp_id: mvpId,
  suite: 'SPIKE_01_CLEANUP',
  environment: { platform: process.platform, arch: process.arch },
  artifact_hashes: {},
  command: [process.execPath].concat(process.argv.slice(1)),
  timestamps: { started_at: new Date().toISOString(), finished_at: new Date().toISOString() },
  exit_code: pathsRemoved && processCleared && startupClean ? 0 : 1,
  cases: [{
    case_id: 'T10',
    status: pathsRemoved && processCleared && startupClean ? 'PASS' : 'FAIL',
    summary: pathsRemoved && processCleared && startupClean ? 'Isolated deployment and userData were removed with no matching process or startup reference.' : 'Cleanup left a path, process, or startup reference.',
    metrics: { removals: removals, processes_before: before, processes_after: after, startup_before: startupBefore, startup_after: startupAfter },
    evidence: [],
  }],
  evidence: [],
  notes: ['Only the explicit deployment path, the historical C:\\测试 目录\\mvp spike01 path, and the explicit or matching isolated userData directory are deleted.'],
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
process.stdout.write('REPORT_WRITTEN:' + reportPath + '\n');
process.exit(report.exit_code);
