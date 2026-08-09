'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { SAFE_ID_RE, ensureDir, fail, requirePattern, writeJson } = require('./common');
const { transitionLease } = require('./lease');

function baseSshArgs(config) {
  for (const file of [config.identityFile, config.knownHostsFile]) {
    if (!file || !fs.existsSync(file)) fail('SSH control file missing: ' + file, 'SSH_CONFIG_INVALID');
  }
  return [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=12',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'UserKnownHostsFile=' + config.knownHostsFile,
    '-i', config.identityFile,
    '-p', String(config.port || 22),
  ];
}

function target(config) {
  return config.user + '@' + config.ip;
}

function run(program, args, options) {
  const result = childProcess.spawnSync(program, args, {
    encoding: 'utf8',
    timeout: (options && options.timeoutMs) || 30000,
    maxBuffer: (options && options.maxBuffer) || 32 * 1024 * 1024,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error ? result.error.message : String(result.stderr || result.stdout || '').trim();
    fail(program + ' failed: ' + detail, (options && options.code) || 'REMOTE_COMMAND_FAILED');
  }
  return result;
}

function ssh(config, remoteCommand, timeoutMs) {
  return run(config.ssh || 'ssh', baseSshArgs(config).concat([target(config), remoteCommand]), {
    timeoutMs,
    code: 'SSH_FAILED',
  });
}

function scpArgs(config) {
  const args = baseSshArgs(config);
  const portIndex = args.indexOf('-p');
  if (portIndex >= 0) args[portIndex] = '-P';
  return args;
}

function preflight(config, options) {
  const expectedHostname = options.hostname || 'dccs-chaizl-PC';
  const fixed = [
    '@echo off',
    'echo A6_PREFLIGHT_V1',
    'echo HOSTNAME_BEGIN', 'hostname', 'echo HOSTNAME_END',
    'echo VER_BEGIN', 'ver', 'echo VER_END',
    'echo ARCH_BEGIN', 'echo %PROCESSOR_ARCHITECTURE%', 'echo ARCH_END',
    'echo SERVICE_BEGIN', 'sc query BvSshServer', 'echo SERVICE_END',
    'echo TIME_BEGIN', 'wmic os get LocalDateTime /value', 'echo TIME_END',
    'echo SPACE_BEGIN', 'wmic logicaldisk where "DeviceID=\'C:\'" get DeviceID,FileSystem,FreeSpace,Size,VolumeName /format:list', 'echo SPACE_END',
    'echo DISK_BEGIN', 'wmic diskdrive get DeviceID,InterfaceType,MediaType,Model,SerialNumber /format:csv', 'echo DISK_END',
    'echo MAP1_BEGIN', 'wmic path Win32_DiskDriveToDiskPartition get Antecedent,Dependent /format:list', 'echo MAP1_END',
    'echo MAP2_BEGIN', 'wmic path Win32_LogicalDiskToPartition get Antecedent,Dependent /format:list', 'echo MAP2_END',
    'echo CERTUTIL_BEGIN', 'where certutil', 'echo CERTUTIL_END',
    'echo RESIDUE_BEGIN', 'wmic process where "ExecutablePath like \'C:\\\\acceptance\\\\A6-SSD-%%\'" get ProcessId,ParentProcessId,ExecutablePath /format:csv', 'echo RESIDUE_END',
  ].join(' & ');
  const result = ssh(config, 'cmd.exe /d /s /c "' + fixed.replace(/"/g, '\\"') + '"', 60000);
  const text = result.stdout.replace(/\r/g, '');
  const blocked = [];
  if (!new RegExp('HOSTNAME_BEGIN\\n' + expectedHostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\nHOSTNAME_END', 'i').test(text)) blocked.push('hostname mismatch');
  if (!/Microsoft Windows \[Version 6\.1\.7601\]/i.test(text)) blocked.push('OS build is not Win7 SP1 build 7601');
  if (!/ARCH_BEGIN\nAMD64\nARCH_END/i.test(text)) blocked.push('architecture is not AMD64');
  if (!/SERVICE_BEGIN[\s\S]*STATE\s*:\s*4\s+RUNNING[\s\S]*SERVICE_END/i.test(text)) blocked.push('BvSshServer is not RUNNING');
  if (!/SPACE_BEGIN[\s\S]*FileSystem=NTFS[\s\S]*SPACE_END/i.test(text)) blocked.push('C: is not confirmed NTFS');
  if (!/DISK_BEGIN[\s\S]*Samsung SSD 870 EVO[\s\S]*DISK_END/i.test(text)) blocked.push('Samsung 870 EVO SSD is not confirmed');
  if (!/MAP1_BEGIN[\s\S]*Disk #0[\s\S]*MAP1_END/i.test(text) || !/MAP2_BEGIN[\s\S]*Disk #0[\s\S]*Disk #0[\s\S]*MAP2_END/i.test(text)) blocked.push('C: to local SSD mapping is not confirmed');
  if (!/CERTUTIL_BEGIN[\s\S]*certutil\.exe[\s\S]*CERTUTIL_END/i.test(text)) blocked.push('certutil is unavailable');
  const residueSection = (text.match(/RESIDUE_BEGIN\n([\s\S]*?)RESIDUE_END/i) || [null, ''])[1];
  if (/\\acceptance\\A6-SSD-/i.test(residueSection)) blocked.push('A6 acceptance process residue exists');
  const report = {
    schema_version: 1,
    status: blocked.length ? 'PREFLIGHT_BLOCKED' : 'PASS',
    checked_at_utc: new Date().toISOString(),
    target: { ip: config.ip, port: config.port || 22, hostname: expectedHostname, os_build: '7601', arch: 'x64' },
    profile: 'E22-SQLITE343-LOCAL-SSD',
    facts: { ntfs: !blocked.includes('C: is not confirmed NTFS'), ssd_model: 'Samsung SSD 870 EVO', ssh_service: 'RUNNING' },
    blockers: blocked,
    raw_sha256: require('crypto').createHash('sha256').update(text).digest('hex'),
  };
  if (options.output) writeJson(options.output, report);
  if (blocked.length) fail('preflight blocked: ' + blocked.join('; '), 'PREFLIGHT_BLOCKED');
  return report;
}

function execute(config, options) {
  const runId = requirePattern(options.runId, 'run ID', SAFE_ID_RE);
  const remoteName = 'A6-SSD-' + runId;
  const remoteRoot = 'C:\\acceptance\\' + remoteName;
  const scpRoot = '/C:/acceptance/';
  transitionLease({ stateFile: options.stateFile, leaseId: options.leaseId, toState: 'RUNNING' });
  let result;
  try {
    ssh(config, 'cmd.exe /d /s /c "if not exist C:\\acceptance mkdir C:\\acceptance"', 30000);
    run(config.scp || 'scp', scpArgs(config).concat(['-r', options.packageRoot, target(config) + ':' + scpRoot]), { timeoutMs: 30 * 60 * 1000, code: 'SCP_UPLOAD_FAILED' });
    run(config.scp || 'scp', scpArgs(config).concat([options.leaseFile, target(config) + ':' + scpRoot + remoteName + '/lease.json']), { timeoutMs: 120000, code: 'SCP_UPLOAD_FAILED' });
    run(config.scp || 'scp', scpArgs(config).concat([options.signatureFile, target(config) + ':' + scpRoot + remoteName + '/lease.sig']), { timeoutMs: 120000, code: 'SCP_UPLOAD_FAILED' });
    const command = 'cmd.exe /d /s /c "set ELECTRON_RUN_AS_NODE=1&&\"' + remoteRoot + '\\runtime\\electron\\electron.exe\" \"' + remoteRoot + '\\runner\\run-a6.js\" \"' + remoteRoot + '\""';
    result = ssh(config, command, 90 * 60 * 1000);
    transitionLease({ stateFile: options.stateFile, leaseId: options.leaseId, toState: 'RETURNED' });
  } catch (error) {
    try { transitionLease({ stateFile: options.stateFile, leaseId: options.leaseId, toState: 'RECOVERY_REQUIRED', note: error.message }); } catch (_) {}
    throw error;
  }
  return { remoteRoot, stdout: result.stdout, stderr: result.stderr };
}

function collect(config, options) {
  ensureDir(options.outputRoot);
  const remoteName = 'A6-SSD-' + requirePattern(options.runId, 'run ID', SAFE_ID_RE);
  const remoteBase = target(config) + ':/C:/acceptance/' + remoteName + '/';
  for (const name of ['evidence', 'logs', 'runner-result.json', 'manifest.json']) {
    run(config.scp || 'scp', scpArgs(config).concat(['-r', remoteBase + name, options.outputRoot]), { timeoutMs: 20 * 60 * 1000, code: 'SCP_RETURN_FAILED' });
  }
}

function postflight(config, options) {
  const remoteName = 'A6-SSD-' + requirePattern(options.runId, 'run ID', SAFE_ID_RE);
  const fixed = '@echo off & echo A6_POSTFLIGHT_V1 & sc query BvSshServer & echo PROCESSES_BEGIN & wmic process where "ExecutablePath like \'C:\\\\acceptance\\\\' + remoteName + '\\\\%%\'" get ProcessId,ParentProcessId,ExecutablePath /format:csv & echo PROCESSES_END';
  const result = ssh(config, 'cmd.exe /d /s /c "' + fixed.replace(/"/g, '\\"') + '"', 60000);
  const text = result.stdout.replace(/\r/g, '');
  const processSection = (text.match(/PROCESSES_BEGIN\n([\s\S]*?)PROCESSES_END/i) || [null, ''])[1];
  const blockers = [];
  if (!/STATE\s*:\s*4\s+RUNNING/i.test(text)) blockers.push('BvSshServer is not RUNNING');
  if (new RegExp('\\\\acceptance\\\\' + remoteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(processSection)) blockers.push('acceptance process residue exists');
  const report = { schema_version: 1, status: blockers.length ? 'RECOVERY_REQUIRED' : 'PASS', checked_at_utc: new Date().toISOString(), run_id: options.runId, ssh_port_reachable: true, ssh_service: /STATE\s*:\s*4\s+RUNNING/i.test(text), zero_residue: blockers.length === 0, blockers };
  if (options.output) writeJson(options.output, report);
  if (blockers.length) fail('postflight failed: ' + blockers.join('; '), 'RECOVERY_REQUIRED');
  return report;
}

module.exports = { collect, execute, postflight, preflight, ssh };
