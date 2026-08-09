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
  // Bitvise on this Win7 host returns CP936 and applies cmd quoting before the
  // process starts. Keep each read-only probe as a separate fixed command so
  // localized output cannot erase marker boundaries or weaken a check.
  const raw = {
    hostname: ssh(config, 'hostname', 30000).stdout,
    version: ssh(config, 'ver', 30000).stdout,
    arch: ssh(config, 'cmd.exe /d /c echo %PROCESSOR_ARCHITECTURE%', 30000).stdout,
    service: ssh(config, 'sc query BvSshServer', 30000).stdout,
    time: ssh(config, 'wmic os get LocalDateTime /value', 30000).stdout,
    space: ssh(config, 'wmic logicaldisk where "DeviceID=\'C:\'" get DeviceID,FileSystem,FreeSpace,Size,VolumeName /format:list', 30000).stdout,
    disk: ssh(config, 'wmic diskdrive get DeviceID,InterfaceType,MediaType,Model,SerialNumber /format:csv', 30000).stdout,
    diskMap: ssh(config, 'wmic path Win32_DiskDriveToDiskPartition get Antecedent,Dependent /format:list', 30000).stdout,
    volumeMap: ssh(config, 'wmic path Win32_LogicalDiskToPartition get Antecedent,Dependent /format:list', 30000).stdout,
    certutil: ssh(config, 'where certutil', 30000).stdout,
    residue: ssh(config, 'wmic process where "ExecutablePath like \'C:\\\\acceptance\\\\A6-SSD-%%\'" get ProcessId,ParentProcessId,ExecutablePath /format:csv', 30000).stdout,
  };
  const normalized = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value.replace(/\r/g, '')]));
  const blocked = [];
  if (normalized.hostname.trim().toLowerCase() !== expectedHostname.toLowerCase()) blocked.push('hostname mismatch');
  if (!/6\.1\.7601/i.test(normalized.version)) blocked.push('OS build is not Win7 SP1 build 7601');
  if (normalized.arch.trim().toUpperCase() !== 'AMD64') blocked.push('architecture is not AMD64');
  if (!/STATE\s*:\s*4\s+RUNNING/i.test(normalized.service)) blocked.push('BvSshServer is not RUNNING');
  if (!/FileSystem=NTFS/i.test(normalized.space)) blocked.push('C: is not confirmed NTFS');
  const freeMatch = normalized.space.match(/FreeSpace=(\d+)/i);
  if (!freeMatch || Number(freeMatch[1]) < 5 * 1024 * 1024 * 1024) blocked.push('C: has less than 5GB free');
  // The controller reports the model as "Samsun  SSD" on this host; require
  // the distinctive 870 EVO token plus physical drive 0 and never rely on
  // generic "Fixed hard disk media".
  if (!/Samsun\w*\s+SSD\s+870\s+EVO/i.test(normalized.disk) || !/PHYSICALDRIVE0/i.test(normalized.disk)) blocked.push('Samsung 870 EVO SSD is not confirmed');
  if (!/PHYSICALDRIVE0/i.test(normalized.diskMap) || !/Disk #0, Partition #1/i.test(normalized.diskMap) || !/Disk #0, Partition #1/i.test(normalized.volumeMap) || !/LogicalDisk\.DeviceID="C:"/i.test(normalized.volumeMap)) blocked.push('C: to local SSD mapping is not confirmed');
  if (!/certutil\.exe/i.test(normalized.certutil)) blocked.push('certutil is unavailable');
  if (/\\acceptance\\A6-SSD-/i.test(normalized.residue)) blocked.push('A6 acceptance process residue exists');
  const rawDigestInput = Object.keys(normalized).sort().map((key) => key + '\n' + normalized[key]).join('\n');
  const report = {
    schema_version: 1,
    status: blocked.length ? 'PREFLIGHT_BLOCKED' : 'PASS',
    checked_at_utc: new Date().toISOString(),
    target: { ip: config.ip, port: config.port || 22, hostname: expectedHostname, os_build: '7601', arch: 'x64' },
    profile: 'E22-SQLITE343-LOCAL-SSD',
    facts: {
      ntfs: !blocked.includes('C: is not confirmed NTFS'),
      free_space_bytes: freeMatch ? Number(freeMatch[1]) : null,
      physical_drive: 0,
      system_partition: 'Disk #0, Partition #1',
      ssd_model: 'Samsung 870 EVO',
      ssh_service: 'RUNNING',
      certutil: !blocked.includes('certutil is unavailable'),
      remote_time: (normalized.time.match(/LocalDateTime=([^\n]+)/i) || [null, null])[1],
    },
    blockers: blocked,
    raw_sha256: require('crypto').createHash('sha256').update(rawDigestInput).digest('hex'),
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
  for (const name of ['evidence', 'logs', 'runner-result.json', 'runtime-smoke.json', 'manifest.json']) {
    run(config.scp || 'scp', scpArgs(config).concat(['-r', remoteBase + name, options.outputRoot]), { timeoutMs: 20 * 60 * 1000, code: 'SCP_RETURN_FAILED' });
  }
}

function postflight(config, options) {
  const remoteName = 'A6-SSD-' + requirePattern(options.runId, 'run ID', SAFE_ID_RE);
  const service = ssh(config, 'sc query BvSshServer', 30000).stdout.replace(/\r/g, '');
  const processes = ssh(config, 'wmic process where "ExecutablePath like \'C:\\\\acceptance\\\\' + remoteName + '\\\\%%\'" get ProcessId,ParentProcessId,ExecutablePath /format:csv', 30000).stdout.replace(/\r/g, '');
  const blockers = [];
  if (!/STATE\s*:\s*4\s+RUNNING/i.test(service)) blockers.push('BvSshServer is not RUNNING');
  if (new RegExp('\\\\acceptance\\\\' + remoteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(processes)) blockers.push('acceptance process residue exists');
  const report = { schema_version: 1, status: blockers.length ? 'RECOVERY_REQUIRED' : 'PASS', checked_at_utc: new Date().toISOString(), run_id: options.runId, ssh_port_reachable: true, ssh_service: /STATE\s*:\s*4\s+RUNNING/i.test(service), zero_residue: blockers.length === 0, blockers };
  if (options.output) writeJson(options.output, report);
  if (blockers.length) fail('postflight failed: ' + blockers.join('; '), 'RECOVERY_REQUIRED');
  return report;
}

module.exports = { collect, execute, postflight, preflight, ssh };
