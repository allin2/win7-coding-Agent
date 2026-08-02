'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const reportArgument = process.argv.find((argument) => argument.indexOf('--report=') === 0);
const mvpArgument = process.argv.find((argument) => argument.indexOf('--mvp-id=') === 0);
const reportPath = reportArgument ? reportArgument.slice('--report='.length) : 'C:\\acceptance\\mvp_inventory.json';
const mvpId = mvpArgument ? mvpArgument.slice('--mvp-id='.length) : 'MVP-UNKNOWN';
const startedAt = new Date().toISOString();

function sha256(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch (error) {
    return 'UNAVAILABLE:' + error.code;
  }
}

function collect(command, args) {
  const result = childProcess.spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return {
    command: [command].concat(args),
    exit_code: result.status,
    timed_out: !!result.error && result.error.code === 'ETIMEDOUT',
    error: result.error ? String(result.error.message) : null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

const electronPath = 'C:\\acceptance\\electron\\electron.exe';
const gitPath = 'C:\\acceptance\\git\\cmd\\git.exe';
const commands = {
  os: collect('wmic', ['os', 'get', 'Caption,Version,OSArchitecture,ServicePackMajorVersion,BuildNumber', '/value']),
  cpu: collect('wmic', ['cpu', 'get', 'Name,NumberOfCores,NumberOfLogicalProcessors', '/value']),
  memory: collect('wmic', ['computersystem', 'get', 'TotalPhysicalMemory', '/value']),
  gpu: collect('wmic', ['path', 'win32_VideoController', 'get', 'Name,DriverVersion,AdapterRAM', '/value']),
  disk: collect('wmic', ['diskdrive', 'get', 'Model,MediaType,Size,InterfaceType', '/value']),
  free_space: collect('fsutil', ['volume', 'diskfree', 'C:']),
  current_user: collect('whoami', ['/all']),
  paths: collect('where', ['python']),
  node_path: collect('where', ['node']),
  hotfixes: collect('wmic', ['qfe', 'get', 'HotFixID,InstalledOn', '/format:csv']),
  ip_config: collect('ipconfig', ['/all']),
  electron_version: collect(electronPath, ['--version']),
  git_version: collect(gitPath, ['--version']),
  ssh_service: collect('sc', ['queryex', 'BvSshServer']),
  ssh_service_config: collect('sc', ['qc', 'BvSshServer']),
};

const report = {
  schema_version: 1,
  mvp_id: mvpId,
  suite: 'WIN7_ENVIRONMENT_INVENTORY',
  environment: {
    host_platform: process.platform,
    host_arch: process.arch,
    node: process.versions.node || null,
    electron: process.versions.electron || null,
  },
  artifact_hashes: {
    inventory_script: sha256(__filename),
    electron_exe: sha256(electronPath),
    git_exe: sha256(gitPath),
  },
  command: [process.execPath, __filename, '--report=' + reportPath, '--mvp-id=' + mvpId],
  timestamps: { started_at: startedAt, finished_at: new Date().toISOString() },
  exit_code: 0,
  cases: Object.keys(commands).map(function (name) {
    const item = commands[name];
    return {
      case_id: name,
      status: item.exit_code === 0 ? 'PASS' : 'PARTIAL',
      summary: item.exit_code === 0 ? 'Command completed.' : 'Command did not complete successfully; raw output retained.',
      metrics: { exit_code: item.exit_code, timed_out: item.timed_out },
      evidence: [],
    };
  }),
  evidence: [],
  notes: ['Read-only inventory. Does not change registry, network configuration, services, or application state.'],
  raw: commands,
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
process.stdout.write('REPORT_WRITTEN:' + reportPath + '\n');
