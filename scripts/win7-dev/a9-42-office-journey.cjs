'use strict';
// Candidate-external driver; authorization is checked by the local entry. No product implementation is replaced.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const cp = require('child_process');
const os = require('os');
const lightweight = require('./journeys/lightweight.cjs');
const authority = require('../release/validation/win7-alpha3/authority.cjs');
const ROOT = 'C:\\A9-DEV';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const need = (value, code) => { if (!value) throw new Error(code); };
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeError = error => /^[A-Z][A-Z0-9_]{1,90}$/.test(error && error.message || '') ? error.message : 'DRIVER_OPERATION_FAILED';
const EXECUTION_LAYOUT = Object.freeze({
  schema_version: 1,
  channel_root: 'C:\\A9-DEV',
  run_root_template: 'C:\\A9-DEV\\run\\{run_prefix8}',
  run_key: 'lowercase-uuid-v4-prefix8',
  task_prefix_template: 'A9-DEV-{run_prefix8}-',
  package_relative_root: 'p',
  tools_relative_root: 't',
  evidence_relative_root: 'e',
  data_relative_root: 'd',
  workspace_relative_root: 'w',
});
const FORBIDDEN_DRIVER_ENV = Object.freeze([
  'A9_DEV_ROOT', 'A9_DEV_RUN_ROOT', 'A9_DEV_PACKAGE_ROOT', 'A9_DEV_WORKSPACE_ROOT', 'A9_DEV_DATA_ROOT',
  'A9_DEV_RUN_ID', 'A9_DEV_EXECUTION_BINDING', 'A9_DEV_EXECUTION_BINDING_PATH', 'WIN7AGENT_A9_DATAROOT',
  'A9_DEV_EVIDENCE_CLASS', 'A9_DEV_SOURCE', 'A9_DEV_SOURCE_COMMIT', 'A9_DEV_PACKAGE_SHA256',
  'A9_DEV_ZIP', 'A9_DEV_ZIP_SHA256', 'A9_DEV_BUDGET', 'A9_DEV_DEADLINE_UTC',
]);

function rejectDriverOverrides(args = [], env = process.env) {
  for (const key of FORBIDDEN_DRIVER_ENV) need(env[key] === undefined, 'CONFIG_ENV_OVERRIDE');
  for (const arg of args) {
    need(typeof arg === 'string' && !/^--(?:root|run|run-id|run-root|data-root|package-root|workspace-root|execution-binding|execution-binding-path|evidence-class|source|source-commit|zip|zip-sha256|package-sha256|budget|deadline)(?:=|$)/i.test(arg),
      'CONFIG_CLI_OVERRIDE');
  }
}

function readExecutionBinding(options) {
  const settings = options || {};
  if (Buffer.isBuffer(settings.executionBindingBytes)) return settings.executionBindingBytes;
  need(typeof settings.executionBindingPath === 'string' && settings.executionBindingPath, 'CONFIG_EXECUTION_BINDING');
  if (process.platform === 'win32') noLinks(ROOT, settings.executionBindingPath);
  return fs.readFileSync(settings.executionBindingPath);
}

function executionBindingPathFor(config) {
  need(config && typeof config.execution_binding_path === 'string' && config.execution_binding_path, 'CONFIG_EXECUTION_BINDING');
  return config.execution_binding_path;
}

function expandExecutionLayout(binding) {
  authority.validateLayout(EXECUTION_LAYOUT);
  const runId = String(binding.run_id).toLowerCase();
  const runPrefix8 = runId.slice(0, 8);
  const runRoot = `C:\\A9-DEV\\run\\${runPrefix8}`;
  const toolsRoot = runRoot + '\\t';
  const packageRoot = runRoot + '\\p';
  return Object.freeze({
    schema_version: 1,
    run_id: runId,
    run_prefix8: runPrefix8,
    run_root: runRoot,
    tools_root: toolsRoot,
    package_root: packageRoot,
    input_package_root: toolsRoot + '\\package',
    workspace_root: runRoot + '\\w',
    data_root: packageRoot + '\\portable-data',
    evidence_root: runRoot + '\\e',
    zip_path: toolsRoot + '\\package.zip',
    cmd_path: toolsRoot + '\\cmd.exe',
    source_binding_path: toolsRoot + '\\source-binding.json',
    execution_binding_path: toolsRoot + '\\execution-binding.json',
    task_prefix: `A9-DEV-${runPrefix8}-`,
  });
}

function loadExecutionBinding(options) {
  const bytes = readExecutionBinding(options);
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch (_) { throw new Error('CONFIG_EXECUTION_BINDING_JSON'); }
  parsed = authority.validateExecutionBinding(parsed);
  return Object.freeze({
    bytes,
    sha256: authority.sha256(bytes),
    evidence_class: parsed.evidence_class,
    run_id: parsed.run_id.toLowerCase(),
    source_commit: parsed.candidate.source_commit,
    package_sha256: parsed.candidate.package_sha256,
    manifest_sha256: parsed.candidate.manifest_sha256,
    kit_sha256: parsed.candidate.kit_sha256,
    helper_sha256: parsed.candidate.helper_sha256,
    target: parsed.target,
    layout: expandExecutionLayout(parsed),
    binding: parsed,
  });
}

// Preserve repository-relative requires in prepared materials and cloned Electron apps.
function driverClosure(entry) {
  need(['a9-3440-trial.cjs', 'a9-42-office-journey.cjs', 'a9-42-real-model-trial.cjs'].includes(entry), 'DRIVER_ENTRY');
  const names = [entry, 'a9-42-office-journey.cjs'];
  if (entry === 'a9-42-real-model-trial.cjs') names.push('a9-42-real-model-relay.cjs',
    'a9-42-real-model-direct.cjs', 'a9-42-real-model-samples.cjs', 'a9-42-resource-sampler.cjs');
  return [...new Set(names)].map(name => 'scripts/win7-dev/' + name).concat([
    'scripts/win7-dev/journeys/lightweight.cjs',
    'scripts/release/validation/win7-alpha3/authority.cjs', 'scripts/release/validation/win7-alpha3/deny-set.cjs']);
}
function copyDriverClosure(destination, entry, io = fs) {
  return driverClosure(entry).map(relative => {
    const bytes = io.readFileSync(path.resolve(__dirname, '../..', relative));
    const file = path.join(destination, ...relative.split('/'));
    io.mkdirSync(path.dirname(file), { recursive: true });
    io.writeFileSync(file, bytes, { flag: 'wx' });
    need(hash(io.readFileSync(file)) === hash(bytes), 'DRIVER_CLOSURE_COPY_HASH');
    return { path: relative, sha256: hash(bytes) };
  });
}
function verifyDriverClosure(entries, entry, io = fs, codeRoot = path.resolve(__dirname, '../..')) {
  const paths = driverClosure(entry);
  need(Array.isArray(entries) && entries.length === paths.length, 'DRIVER_CLOSURE');
  for (const relative of paths) {
    const matches = entries.filter(item => item.path === relative);
    need(matches.length === 1 && hash(io.readFileSync(path.join(codeRoot, ...relative.split('/')))) === matches[0].sha256,
      'DRIVER_CLOSURE_HASH');
  }
}

function taskNameFor(execution, profile) {
  need(typeof profile === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(profile), 'CONFIG_PROFILE');
  return execution.layout.task_prefix + profile;
}

function inside(root, file) {
  const relative = path.win32.relative(root, file);
  return path.win32.isAbsolute(root) && path.win32.isAbsolute(file)
    && relative !== '' && !relative.startsWith('..') && !path.win32.isAbsolute(relative)
    && !relative.split(/[\\/]/).some((part) => /[:\x00-\x1f]/.test(part));
}

function parseProcesses(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  need(lines.length > 1, 'PROCESS_QUERY_EMPTY');
  const header = lines[0].split(',');
  for (const name of ['ProcessId', 'ParentProcessId', 'CreationDate', 'ExecutablePath', 'SessionId', 'Name']) {
    need(header.includes(name), 'PROCESS_QUERY_COLUMNS');
  }
  return lines.slice(1).map((line) => {
    const values = [];
    let quoted = false, cell = '';
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === '"') {
        if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = !quoted;
      } else if (line[i] === ',' && !quoted) { values.push(cell); cell = ''; }
      else cell += line[i];
    }
    need(!quoted, 'PROCESS_QUERY_CSV');
    values.push(cell);
    need(values.length === header.length, 'PROCESS_QUERY_CSV');
    const raw = Object.fromEntries(header.map((key, index) => [key, values[index]]));
    need(/^\d+$/.test(raw.ProcessId) && /^\d+$/.test(raw.ParentProcessId), 'PROCESS_QUERY_PID');
    return { pid: Number(raw.ProcessId), parent: Number(raw.ParentProcessId), created: raw.CreationDate,
      image: raw.ExecutablePath, imageSource: raw.ExecutablePath ? 'executable_path' : null,
      session: /^\d+$/.test(raw.SessionId) ? Number(raw.SessionId) : null, name: raw.Name };
  });
}

function processRows() {
  const result = cp.spawnSync(path.join(process.env.SystemRoot, 'System32', 'wbem', 'WMIC.exe'),
    ['process', 'get', 'ProcessId,ParentProcessId,CreationDate,ExecutablePath,SessionId,Name', '/format:csv'],
    { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
  need(!result.error && result.status === 0, 'PROCESS_QUERY_FAILED');
  return parseProcesses(result.stdout);
}

function probeProcessInstance(row, config) {
  need(Number.isSafeInteger(row.pid) && row.pid > 0 && /^\d{14}\.\d{6}[+-]\d{3}$/.test(row.created), 'PROCESS_NATIVE_INPUT');
  const code = `using System;using System.Text;using System.Runtime.InteropServices;
public static class A9IdentityQuery {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr handle,out long creation,out long exit,out long kernel,out long user);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageNameW(IntPtr handle,uint flags,[Out] StringBuilder name,ref uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool ProcessIdToSessionId(uint pid,out uint session);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
 public static string Probe(uint pid,long expected) {
  IntPtr h=OpenProcess(0x00101000,false,pid);
  if(h==IntPtr.Zero){if(Marshal.GetLastWin32Error()==87)return "absent|87";throw new Exception("PROCESS_NATIVE_OPEN");}
  try {
   long creation,exit,kernel,user;if(!GetProcessTimes(h,out creation,out exit,out kernel,out user))throw new Exception("PROCESS_NATIVE_TIME");
   if(creation/10!=expected/10)throw new Exception("PROCESS_NATIVE_REUSED");
   uint wait=WaitForSingleObject(h,0);if(wait==0)return "exited|"+creation;
   if(wait!=258)throw new Exception("PROCESS_NATIVE_WAIT");
   StringBuilder image=new StringBuilder(32768);uint size=32768,session;
   if(!QueryFullProcessImageNameW(h,0,image,ref size)||!ProcessIdToSessionId(pid,out session))throw new Exception("PROCESS_NATIVE_QUERY");
   return "present|"+creation+"|"+session+"|"+Convert.ToBase64String(Encoding.UTF8.GetBytes(image.ToString()));
  }finally{if(!CloseHandle(h))throw new Exception("PROCESS_NATIVE_CLOSE");}
 }
}`;
  const ps = `$ErrorActionPreference='Stop';try{Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(code).toString('base64')}')));$expected=[Management.ManagementDateTimeConverter]::ToDateTime('${row.created}').ToUniversalTime().ToFileTimeUtc();[Console]::Out.WriteLine([A9IdentityQuery]::Probe(${row.pid},$expected))}catch{[Console]::Out.WriteLine('PROCESS_NATIVE_UNKNOWN');exit 1}`;
  const executable = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = cp.spawnSync(executable, ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],
    { encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:65536,
      env:{...process.env,TEMP:path.join(config.run_root,'environment/temp'),TMP:path.join(config.run_root,'environment/temp')} });
  need(!result.error && result.status === 0, 'PROCESS_NATIVE_UNKNOWN');
  const fields = result.stdout.trim().split('|');
  if (fields[0] === 'absent') { need(fields.length === 2 && fields[1] === '87', 'PROCESS_NATIVE_RESULT'); return {state:'absent',win32_error:87}; }
  need(/^\d+$/.test(fields[1] || ''), 'PROCESS_NATIVE_RESULT');
  if (fields[0] === 'exited') { need(fields.length === 2, 'PROCESS_NATIVE_RESULT'); return {state:'exited',creation_filetime:fields[1]}; }
  need(fields[0] === 'present' && fields.length === 4 && /^\d+$/.test(fields[2]), 'PROCESS_NATIVE_RESULT');
  return {state:'present',creation_filetime:fields[1],session:Number(fields[2]),image:Buffer.from(fields[3],'base64').toString('utf8')};
}

function resolveObservedRows(rows, observed, rootPid, session, probe, evidence) {
  const selected = new Set([rootPid, ...observed.map(row=>row.pid)]);
  for (let pass=0;pass<rows.length;pass++) { let added=false;for(const row of rows)if(selected.has(row.parent)&&!selected.has(row.pid)){selected.add(row.pid);added=true;}if(!added)break; }
  return rows.flatMap(row => {
    if (!selected.has(row.pid) || row.image || row.name.toLowerCase()==='wmic.exe') return [row];
    need(/^\d{14}\.\d{6}[+-]\d{3}$/.test(row.created) && row.session===session, 'PROCESS_CHILD_IDENTITY_UNKNOWN');
    need(evidence.length<64, 'PROCESS_NATIVE_EVIDENCE_LIMIT');
    const fact=probe(row);evidence.push({at:new Date().toISOString(),wmi_instance:row,native:fact});
    if(fact.state==='absent'){need(fact.win32_error===87,'PROCESS_NATIVE_RESULT');return [];}
    if(fact.state==='exited'){need(/^\d+$/.test(fact.creation_filetime),'PROCESS_NATIVE_RESULT');return [];}
    need(fact.state==='present'&&fact.session===session&&typeof fact.image==='string'
      &&path.win32.isAbsolute(fact.image)&&path.win32.basename(fact.image).toLowerCase()===row.name.toLowerCase(),'PROCESS_NATIVE_RESULT');
    return [{...row,image:fact.image,imageSource:'native_query'}];
  });
}

function observationFailure(error, rootPid, observed, current) {
  const ids = new Set([rootPid, ...observed.map(row => row.pid)]);
  const related = Array.isArray(current) ? current.filter(row => ids.has(row.pid) || ids.has(row.parent)) : null;
  const identity = row => Object.fromEntries(['pid','parent','created','image','imageSource','session','name']
    .map(key => [key, row[key] === undefined ? null : row[key]]));
  const code = String(error && error.message || error);
  return { at: new Date().toISOString(), code: /^PROCESS_[A-Z0-9_]+$/.test(code) ? code : 'PROCESS_OBSERVATION_FAILED',
    root_pid: rootPid, observed_instances: observed.slice(0,128).map(identity),
    current_instances: related === null ? null : related.slice(0,128).map(identity),
    truncated: observed.length > 128 || (related !== null && related.length > 128) };
}

function observedTree(rows, pid) {
  const first = rows.find((row) => row.pid === pid);
  need(first && /^\d{14}\.\d{6}[+-]\d{3}$/.test(first.created) && first.image, 'PROCESS_IDENTITY_UNKNOWN');
  const selected = [first];
  for (let i = 0; i < selected.length; i += 1) {
    for (const row of rows) {
      if (row.parent !== selected[i].pid || selected.some((item) => item.pid === row.pid)
        || row.name.toLowerCase() === 'wmic.exe') continue;
      need(/^\d{14}\.\d{6}[+-]\d{3}$/.test(row.created), 'PROCESS_CHILD_IDENTITY_UNKNOWN');
      // WMIC timestamps are from this same host and query. Older child links are
      // stale PID-parent references, not current descendants.
      if (row.created < selected[i].created) continue;
      need(row.image && row.session === first.session, 'PROCESS_CHILD_IDENTITY_UNKNOWN');
      selected.push(row);
    }
  }
  return selected;
}

function launcherInstances(rows, identity, config) {
  const known = [identity];
  let child = identity;
  for (let i = 0; i < 2; i += 1) {
    const parent = rows.find(row => row.pid === child.parent);
    const matches = parent && typeof parent.image === 'string'
      && parent.image.toLowerCase() === config.cmd_path.toLowerCase();
    if (i > 0 && !matches) break;
    need(matches && parent.session === config.session_id
      && /^\d{14}\.\d{6}[+-]\d{3}$/.test(parent.created)
      && parent.created <= child.created
      && !known.some(row => row.pid === parent.pid), 'LAUNCHER_ANCESTOR_IDENTITY');
    known.push(parent); child = parent;
  }
  const older = rows.find(row => row.pid === child.parent);
  need(!older || !known.some(row => row.pid === older.pid), 'LAUNCHER_CHAIN_DEPTH');
  need(!older || typeof older.image !== 'string' || older.image.toLowerCase() !== config.cmd_path.toLowerCase(), 'LAUNCHER_CHAIN_DEPTH');
  return known;
}

function remainingInstances(observed, current) {
  need(Array.isArray(observed) && observed.length > 0 && Array.isArray(current) && current.length > 0, 'PROCESS_EVIDENCE_MISSING');
  return observed.filter((old) => {
    need(Number.isInteger(old.pid) && old.created && old.image, 'PROCESS_EVIDENCE_INVALID');
    const row = current.find((item) => item.pid === old.pid);
    if (!row) return false;
    need(row.created && row.image, 'PROCESS_CURRENT_IDENTITY_UNKNOWN');
    return row.created === old.created;
  });
}

function isSgToolEnvironment(row, session) {
  const prefix = 'C:\\Program Files (x86)\\SogouInput';
  if (!row || row.imageSource !== 'executable_path' || typeof row.image !== 'string'
    || typeof row.name !== 'string' || row.name.toLowerCase() !== 'sgtool.exe'
    || !Number.isSafeInteger(row.pid) || row.pid <= 0
    || !Number.isSafeInteger(row.parent) || row.parent <= 0
    || !Number.isSafeInteger(session) || session <= 0 || row.session !== session) return false;
  if (!inside(prefix, row.image) || path.win32.basename(row.image).toLowerCase() !== 'sgtool.exe'
    || path.win32.normalize(row.image).toLowerCase() !== row.image.toLowerCase()
    || row.image.split('\\').some((part) => /[. ]$/.test(part))) return false;
  const stamp = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(\d{6})([+-])(\d{3})$/.exec(row.created || '');
  if (!stamp || Number(stamp[9]) > 840) return false;
  const date = new Date(Date.UTC(Number(stamp[1]), Number(stamp[2]) - 1, Number(stamp[3]),
    Number(stamp[4]), Number(stamp[5]), Number(stamp[6])));
  return date.getUTCFullYear() === Number(stamp[1]) && date.getUTCMonth() + 1 === Number(stamp[2])
    && date.getUTCDate() === Number(stamp[3]) && date.getUTCHours() === Number(stamp[4])
    && date.getUTCMinutes() === Number(stamp[5]) && date.getUTCSeconds() === Number(stamp[6]);
}

function extendObservedTree(observed, current, session) {
  const all = observed.slice();
  for (let index = 0; index < all.length; index += 1) {
    const parent = all[index];
    const now = current.find((row) => row.pid === parent.pid);
    if (now && now.created !== parent.created) continue;
    for (const row of current) {
      if (row.parent !== parent.pid || row.name.toLowerCase() === 'wmic.exe'
        || all.some((known) => known.pid === row.pid && known.created === row.created)) continue;
      need(/^\d{14}\.\d{6}[+-]\d{3}$/.test(row.created), 'PROCESS_CHILD_IDENTITY_UNKNOWN');
      if (row.created < parent.created) continue;
      need(row.image && row.session === session, 'PROCESS_CHILD_IDENTITY_UNKNOWN');
      all.push(row);
    }
  }
  return all;
}

function processObservation(observed, current, session) {
  const remaining = remainingInstances(observed, current);
  const environment = observed.filter((row) => isSgToolEnvironment(row, session)).map((old) => {
    const now = current.find((row) => row.pid === old.pid);
    let state = 'absent';
    if (now) {
      state = now.created !== old.created ? 'pid_reused' : 'identity_changed';
      if (now.created === old.created && isSgToolEnvironment(now, session)
        && now.parent === old.parent && now.image.toLowerCase() === old.image.toLowerCase()) state = 'present';
    }
    return { rule: 'ADR-0297', observed_instance: old, current_instance: now || null, state };
  });
  // Classification happens after collecting the complete tree. It never prunes
  // the environment process's children or relaxes another instance's identity.
  const blocking = remaining.filter((row) => !environment.some((item) => item.state === 'present'
    && item.observed_instance.pid === row.pid && item.observed_instance.created === row.created));
  return { remaining_instances: remaining, blocking_instances: blocking, environment_instances: environment };
}

function cleanEnvironment(root, nodeMode) {
  const env = {};
  for (const key of ['SystemRoot', 'windir', 'SystemDrive', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME',
    'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  Object.assign(env, { PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\Wbem`,
    PATHEXT: '.COM;.EXE;.BAT;.CMD', ComSpec: process.env.ComSpec || `${process.env.SystemRoot}\\System32\\cmd.exe`,
    LOCALAPPDATA: path.join(root, 'local'), APPDATA: path.join(root, 'roaming'), USERPROFILE: path.join(root, 'profile'),
    TEMP: path.join(root, 'temp'), TMP: path.join(root, 'temp'), WIN7AGENT_PORTABLE: '0' });
  if (nodeMode) env.ELECTRON_RUN_AS_NODE = '1';
  return env;
}

async function waitFor(read, milliseconds, label) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) {
    const result = await read();
    if (result) return result;
    await delay(250);
  }
  throw new Error(`TIMEOUT_${label}`);
}

async function clickUi(port, selector) {
  try {
    const point = await port.evaluate(`(async () => {const e=document.querySelector(${JSON.stringify(selector)});
      if(!e||e.disabled||e.hidden)throw new Error('UI_ACTION_UNAVAILABLE');
      e.scrollIntoView({block:'center',inline:'nearest'});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const r=e.getBoundingClientRect(),x=Math.floor(r.left+r.width/2),y=Math.floor(r.top+r.height/2),hit=document.elementFromPoint(x,y);
      if(r.width<=0||r.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!hit||!(hit===e||e.contains(hit)))throw new Error('UI_ACTION_OCCLUDED');return {x,y};})()`);
    port.focus();
    for (const type of ['mouseMove','mouseDown','mouseUp']) port.sendInputEvent({ type, ...point,
      ...(type === 'mouseMove' ? {} : { button: 'left', clickCount: 1 }) });
    // Native default actions (including details toggles) must settle before
    // choosing the next matching element or measuring another click target.
    await port.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  } catch (error) {
    const code = /\bUI_ACTION_(?:UNAVAILABLE|OCCLUDED)\b/.exec(String(error && error.message || ''));
    throw new Error(code ? code[0] : 'UI_ACTION_FAILED');
  }
}

function currentIdentity(config) {
  need(process.platform === 'win32' && process.arch === 'x64', 'RUNTIME_PLATFORM');
  need(os.hostname().toUpperCase() === 'DCCS-CHAIZL-PC' && os.release() === '6.1.7601', 'RUNTIME_HOST');
  need(process.versions.electron === '22.3.27' && process.versions.node === '16.17.1', 'RUNTIME_VERSION');
  need(os.userInfo().username.toLowerCase() === 'agent', 'RUNTIME_USER');
  const whoami = path.join(process.env.SystemRoot, 'System32', 'whoami.exe');
  const user = cp.execFileSync(whoami, ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  const sid = 'S-1-5-21-1708701742-428676696-1831205153-1001';
  need(user.includes('"' + sid + '"'), 'RUNTIME_SID');
  const groups = cp.execFileSync(whoami, ['/groups', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  need(groups.includes('S-1-16-8192') && !/S-1-16-(12288|16384)/.test(groups), 'RUNTIME_INTEGRITY');
  const row = observedTree(processRows(), process.pid)[0];
  need(inside(config.run_root, row.image) && row.session === config.session_id, 'RUNTIME_IMAGE_OR_SESSION');
  const execution = loadExecutionBinding({ executionBindingPath: config.execution_binding_path });
  need(execution.target.machine_name.toUpperCase() === os.hostname().toUpperCase()
    && execution.target.account_sid === sid, 'RUNTIME_BINDING_TARGET');
  return { host: os.hostname(), os: os.release(), user: 'agent', sid, integrity: 'Medium', ...row,
    electron: process.versions.electron, node: process.versions.node };
}

function prepareDriverRuntime(config, physicalFs = require('original-fs')) {
  // A packaged Electron always loads resources/app, ignoring the external app
  // argument. Reuse the established candidate-external driver layout: identical
  // Electron runtime bytes, default_app only, then require the real product main.
  const runtimeRoot = path.join(config.run_root, 'driver-electron');
  const appRoot = path.join(config.run_root, 'driver-app');
  need(!physicalFs.existsSync(runtimeRoot) && !physicalFs.existsSync(appRoot), 'DRIVER_RUNTIME_EXISTS');
  const manifest = JSON.parse(physicalFs.readFileSync(path.join(config.package_root, 'release-manifest.json'), 'utf8'));
  const entries = manifest.files.filter((entry) => !entry.path.includes('/')
    || /^(locales|swiftshader)\//.test(entry.path) || entry.path === 'resources/default_app.asar');
  need(entries.some((entry) => entry.path === 'electron.exe')
    && entries.some((entry) => entry.path === 'resources/default_app.asar'), 'DRIVER_RUNTIME_INCOMPLETE');
  for (const entry of entries) {
    const from = path.join(config.package_root, ...entry.path.split('/'));
    const to = path.join(runtimeRoot, ...entry.path.split('/'));
    const bytes = physicalFs.readFileSync(from);
    need(bytes.length === entry.size && hash(bytes) === entry.sha256, 'DRIVER_RUNTIME_SOURCE_HASH');
    physicalFs.mkdirSync(path.dirname(to), { recursive: true });
    physicalFs.writeFileSync(to, bytes, { flag: 'wx' });
    need(hash(physicalFs.readFileSync(to)) === entry.sha256, 'DRIVER_RUNTIME_COPY_HASH');
  }
  physicalFs.mkdirSync(appRoot);
  const driver = physicalFs.readFileSync(__filename);
  need(hash(driver) === config.driver_sha256, 'DRIVER_SOURCE_HASH');
  copyDriverClosure(appRoot, 'a9-42-office-journey.cjs', physicalFs);
  physicalFs.writeFileSync(path.join(appRoot, 'package.json'),
    JSON.stringify({ name: 'a942-office-dev-trial', version: '1.0.0', private: true, main: 'scripts/win7-dev/a9-42-office-journey.cjs' }) + '\n', { flag: 'wx' });
  return { executable: path.join(runtimeRoot, 'electron.exe'), app_root: appRoot, files: entries.length };
}

function copyPortablePackage(config, physicalFs = require('original-fs')) {
  need(!physicalFs.existsSync(config.package_root), 'PORTABLE_DESTINATION_EXISTS');
  const manifestBytes = physicalFs.readFileSync(path.join(config.input_package_root, 'release-manifest.json'));
  need(hash(manifestBytes) === config.manifest_sha256, 'PORTABLE_SOURCE_MANIFEST');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const entries = [...manifest.files, { path: 'release-manifest.json', size: manifestBytes.length, sha256: config.manifest_sha256 }];
  for (const entry of entries) {
    const source = path.resolve(config.input_package_root, entry.path);
    const destination = path.resolve(config.package_root, entry.path);
    need(inside(config.input_package_root, source) && inside(config.package_root, destination), 'PORTABLE_COPY_PATH');
    need(!physicalFs.lstatSync(source).isSymbolicLink(), 'PORTABLE_COPY_LINK');
    const bytes = physicalFs.readFileSync(source);
    need(bytes.length === entry.size && hash(bytes) === entry.sha256, 'PORTABLE_COPY_SOURCE_HASH');
    physicalFs.mkdirSync(path.dirname(destination), { recursive: true });
    physicalFs.writeFileSync(destination, bytes, { flag: 'wx' });
    need(hash(physicalFs.readFileSync(destination)) === entry.sha256, 'PORTABLE_COPY_DESTINATION_HASH');
  }
  need(!physicalFs.existsSync(config.data_root), 'PORTABLE_DATA_NOT_FRESH');
  return { copied_files: entries.length, destination: config.package_root, original_preserved: true };
}


const CONFIG_KEYS = ['schema_version','evidence_class','profile','run_id','source_commit','zip_sha256',
  'manifest_sha256','driver_sha256','source_binding_sha256','manifest_file_count','session_id','task_name','deadline_utc',
  'real_model_request_limit','input_package_root','zip_path','run_root','package_root','workspace_root',
  'data_root','cmd_path','source_binding_path','execution_binding_path','execution_binding_sha256','helper_sha256'];
function canonical(file) {
  return typeof file === 'string' && file.length < 200 && (file === ROOT || file.startsWith(ROOT + '\\'))
    && path.win32.normalize(file) === file && !/[\x00-\x1f<>"|?*]/.test(file)
    && file.split('\\').slice(1).every(part => part && !/[. ]$/.test(part) && !part.includes(':')
      && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
function validateConfig(c, now = Date.now(), allowTemplate = false, options = {}) {
  need(c && Object.keys(c).length === CONFIG_KEYS.length && CONFIG_KEYS.every(k => Object.hasOwnProperty.call(c, k)), 'CONFIG_FIELDS');
  rejectDriverOverrides(options.argv || [], options.env || process.env);
  const execution = loadExecutionBinding(options);
  need(c.schema_version === 1 && c.profile === 'office-journey', 'CONFIG_SCHEMA');
  need(c.run_id === execution.run_id && c.source_commit === execution.source_commit, 'CONFIG_SOURCE');
  need(c.evidence_class === execution.evidence_class, 'CONFIG_EVIDENCE_CLASS');
  for (const key of ['zip_sha256','manifest_sha256','driver_sha256','source_binding_sha256','execution_binding_sha256','helper_sha256']) need(/^[a-f0-9]{64}$/.test(c[key]), 'CONFIG_HASH');
  need(c.zip_sha256 === execution.package_sha256 && c.manifest_sha256 === execution.manifest_sha256
    && c.helper_sha256 === execution.helper_sha256 && c.execution_binding_sha256 === execution.sha256, 'CONFIG_PACKAGE_IDENTITY');
  need(Number.isSafeInteger(c.manifest_file_count) && c.manifest_file_count > 100, 'CONFIG_FILE_COUNT');
  need(Number.isSafeInteger(c.session_id) && c.session_id > 0 && c.real_model_request_limit === 0, 'CONFIG_IDENTITY_BUDGET');
  need(c.task_name === taskNameFor(execution, 'office-journey'), 'CONFIG_TASK_NAME');
  const end = Date.parse(c.deadline_utc);
  need((allowTemplate && c.deadline_utc === null) || (typeof c.deadline_utc === 'string'
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(c.deadline_utc)
    && end > now && end <= now + 60 * 60 * 1000), 'CONFIG_DEADLINE');
  const layout = execution.layout;
  for (const key of ['input_package_root','zip_path','run_root','package_root','workspace_root','data_root','cmd_path','source_binding_path']) need(canonical(c[key]), 'CONFIG_PATH');
  need(typeof c.execution_binding_path === 'string' && c.execution_binding_path, 'CONFIG_EXECUTION_BINDING_PATH');
  for (const [key, expected] of [
    ['run_root', layout.run_root], ['package_root', layout.package_root], ['workspace_root', layout.workspace_root],
    ['data_root', layout.data_root], ['input_package_root', layout.input_package_root], ['zip_path', layout.zip_path],
    ['cmd_path', layout.cmd_path], ['source_binding_path', layout.source_binding_path],
    ['execution_binding_path', layout.execution_binding_path],
  ]) need(c[key] === expected, 'CONFIG_LAYOUT');
  need(inside(layout.run_root, c.input_package_root) && inside(layout.run_root, c.zip_path)
    && !inside(c.input_package_root, layout.run_root), 'CONFIG_INPUT_OVERLAP');
  return c;
}
function noLinks(root, file, io = fs) {
  need(canonical(root) && (root === file || inside(root, file)), 'PHYSICAL_PATH');
  let current = path.win32.parse(root).root;
  for (const part of file.slice(current.length).split('\\')) {
    current = path.win32.join(current, part);
    if (io.existsSync(current)) need(!io.lstatSync(current).isSymbolicLink(), 'PHYSICAL_LINK');
  }
}
function verifyPackage(c, root = c.package_root, io = require('original-fs')) {
  noLinks(ROOT, root, io);
  const skipDataRoot = root.toLowerCase() === c.package_root.toLowerCase() && c.data_root.toLowerCase().startsWith(c.package_root.toLowerCase() + '\\');
  const bytes = io.readFileSync(path.join(root, 'release-manifest.json'));
  need(hash(bytes) === c.manifest_sha256, 'PACKAGE_MANIFEST_HASH');
  const m = JSON.parse(bytes.toString('utf8'));
  need(m.source_commit === c.source_commit && m.source_dirty === false
    && m.external_acceptance_eligible === true && Array.isArray(m.files)
    && m.files.length === c.manifest_file_count, 'PACKAGE_SOURCE');
  const seen = new Set();
  for (const e of m.files) {
    need(typeof e.path === 'string' && !e.path.includes('\\') && !e.path.split('/').some(p => !p || p === '.' || p === '..')
      && !seen.has(e.path.toLowerCase()) && Number.isSafeInteger(e.size) && e.size >= 0 && /^[a-f0-9]{64}$/.test(e.sha256), 'PACKAGE_ENTRY');
    seen.add(e.path.toLowerCase());
    const target = path.join(root, ...e.path.split('/'));
    need(inside(root, target) && target.length < 240, 'PACKAGE_PATH');
    noLinks(root, target, io);
    const actual = io.readFileSync(target);
    need(actual.length === e.size && hash(actual) === e.sha256, 'PACKAGE_FILE_HASH');
  }
  // Full tree: reject injected files, including an extra app.asar/main or SQLite.
  function walk(dir, relative = '') {
    for (const e of io.readdirSync(dir, { withFileTypes: true })) {
      const rel = relative + e.name;
      need(!e.isSymbolicLink(), 'PACKAGE_EXTRA_LINK');
      if (skipDataRoot && dir === root && e.name.toLowerCase() === path.basename(c.data_root).toLowerCase()) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel + '/');
      else need(seen.has(rel.toLowerCase()) || rel === 'release-manifest.json', 'PACKAGE_EXTRA_FILE');
    }
  }
  walk(root);
  return { source_commit: m.source_commit, files: m.files.length, manifest_sha256: hash(bytes) };
}
function verifyBinding(c) {
  noLinks(c.run_root, c.source_binding_path);
  const bytes = fs.readFileSync(c.source_binding_path);
  need(hash(bytes) === c.source_binding_sha256, 'SOURCE_BINDING_HASH');
  const b = JSON.parse(bytes.toString('utf8'));
  need(b.schema_version === 1 && b.source_commit === c.source_commit && b.zip_sha256 === c.zip_sha256
    && b.manifest_sha256 === c.manifest_sha256 && b.driver_sha256 === c.driver_sha256
    && b.execution_binding_sha256 === c.execution_binding_sha256
    && b.source_tree && /^[a-f0-9]{40}$/.test(b.source_tree)
    && b.product_files.length > 10, 'SOURCE_BINDING_IDENTITY');
  verifyDriverClosure(b.execution_files, c.profile === 'office-real-model' ? 'a9-42-real-model-trial.cjs' : 'a9-42-office-journey.cjs');
  for (const e of b.product_files) {
    need(/^resources\/app\/product\//.test(e.path), 'SOURCE_BINDING_PATH');
    const target = path.join(c.input_package_root, ...e.path.split('/'));
    noLinks(c.input_package_root, target);
    need(hash(fs.readFileSync(target)) === e.sha256, 'SOURCE_BINDING_PRODUCT_HASH');
  }
  return { source_tree: b.source_tree, product_files: b.product_files.length };
}

const DOC = { schemaVersion: 1, format: 'docx', blocks: [{ type: 'heading', level: 1, text: '办公样本' }, { type: 'paragraph', text: '原稿甲' }] };
const COPY = { schemaVersion: 1, format: 'docx', blocks: [{ type: 'heading', level: 1, text: '办公样本' }, { type: 'paragraph', text: '副本乙' }] };
const BOOK = { schemaVersion: 1, format: 'xlsx', sheets: [{ name: '数据', rows: [['项目','数量'],['样本',2]] }] };
const FILES = { doc: '原稿 样本.docx', book: '数据 样本.xlsx', copy: '修改 副本.docx', poison: '未回答不得生成.docx' };
function makeFixtureState() { return { phase: 'ready', requests: 0, probes: 0, sequence: 0, pending: null, stopped: false, errors: [] }; }
function call(state, name, args) {
  const id = `a942o-${++state.sequence}`;
  state.pending = { id, name, args };
  return { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] };
}
function documentArgs(file, content) { return { path: file, content: JSON.stringify(content) }; }
function fixtureStep(state, parsed) {
  need(!state.stopped, 'FIXTURE_STOPPED');
  need(parsed && Array.isArray(parsed.messages) && Array.isArray(parsed.tools), 'FIXTURE_REQUEST_SCHEMA');
  const tools = parsed.tools.map(t => t.function && t.function.name);
  const extension = state.versionTools && lightweight.step(state, parsed);
  if (extension) return extension;
  if (tools.includes('probe_test_echo')) {
    need(state.phase === 'ready' && ++state.probes <= (state.versionTools ? 3 : 1) && tools.length === 1, 'FIXTURE_PROBE_REPLAY');
    return { tool_calls: [{ index: 0, id: 'a942o-probe', type: 'function', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] };
  }
  for (const name of ['ask_user','document_write_copy','document_read','document_inspect']) need(tools.includes(name), 'FIXTURE_TOOLS_MISSING');
  let lastUser = -1;
  parsed.messages.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
  const text = lastUser >= 0 ? parsed.messages[lastUser].content : '';
  if (state.phase === 'ready' || state.phase === 'new_done' || state.phase === 'copy_done') {
    const expected = state.phase === 'ready' ? 'a942:office:new' : state.phase === 'new_done' ? 'a942:office:copy' : 'a942:office:cancel';
    need(text === expected, 'FIXTURE_PROMPT');
    if (state.phase === 'new_done') { state.phase = 'copy_read'; return call(state, 'document_read', { path: FILES.doc }); }
    const cancelling = state.phase === 'copy_done';
    state.phase = cancelling ? 'cancel_wait' : 'answer_wait';
    const result = call(state, 'ask_user', { prompt: cancelling ? '取消本次办公生成？' : '确认小样本内容？', options: ['小样本'] });
    // Core must discard the rest of this batch on needs_input.
    result.tool_calls.push({ index: 1, id: 'a942o-never', type: 'function', function: {
      name: 'document_write_copy', arguments: JSON.stringify(documentArgs(FILES.poison, DOC)) } });
    return result;
  }
  need(state.phase !== 'answer_wait' && state.phase !== 'cancel_wait', 'FIXTURE_UNANSWERED_REDISPATCH');
  if (state.phase === 'answer_allowed') {
    need(JSON.stringify(parsed.messages).includes('小样本') && JSON.stringify(parsed.messages).includes('answered'), 'FIXTURE_ANSWER_MISSING');
    state.phase = 'new_doc'; return call(state, 'document_write_copy', documentArgs(FILES.doc, DOC));
  }
  const pending = state.pending;
  need(pending, 'FIXTURE_PENDING');
  const matches = parsed.messages.filter(m => m.role === 'tool' && m.tool_call_id === pending.id);
  need(matches.length === 1, 'FIXTURE_TOOL_RESULT_ID');
  let result;
  try { result = JSON.parse(matches[0].content); } catch (_) { throw new Error('FIXTURE_TOOL_RESULT_JSON'); }
  need(result && !result.error && result.path === pending.args.path, 'FIXTURE_TOOL_FAILED');
  const reading = pending.name !== 'document_write_copy';
  if (reading) need(/^[a-f0-9]{64}$/.test(result.sha256), 'FIXTURE_SOURCE_HASH');
  else need(result.created === true && result.bytesWritten > 0 && result.fidelity === 'content_only', 'FIXTURE_WRITE_FACT');
  if (state.phase === 'new_doc') { state.phase = 'new_book'; return call(state, 'document_write_copy', documentArgs(FILES.book, BOOK)); }
  if (state.phase === 'new_book') { state.phase = 'inspect_doc'; return call(state, 'document_inspect', { path: FILES.doc }); }
  if (state.phase === 'inspect_doc') {
    need(result.canModify === true, 'FIXTURE_INSPECT_FACT');
    state.phase = 'read_doc'; return call(state, 'document_read', { path: FILES.doc });
  }
  if (state.phase === 'read_doc') {
    need(JSON.stringify(result).includes('原稿甲'), 'FIXTURE_DOC_CONTENT');
    state.sourceHash = result.sha256; state.phase = 'inspect_book'; return call(state, 'document_inspect', { path: FILES.book });
  }
  if (state.phase === 'inspect_book') { state.phase = 'read_book'; return call(state, 'document_read', { path: FILES.book }); }
  if (state.phase === 'read_book') {
    need(JSON.stringify(result).includes('项目'), 'FIXTURE_BOOK_CONTENT'); state.phase = 'new_done'; state.pending = null;
    return { content: '本地夹具：已生成并读取真实DOCX/XLSX小样本。' };
  }
  if (state.phase === 'copy_read') {
    need(result.sha256 === state.sourceHash, 'FIXTURE_ORIGINAL_CHANGED'); state.phase = 'copy_write';
    return call(state, 'document_write_copy', { ...documentArgs(FILES.copy, COPY), sourcePath: FILES.doc, sourceSha256: result.sha256 });
  }
  if (state.phase === 'copy_write') {
    need(result.sourceSha256 === state.sourceHash && result.sourcePath === FILES.doc, 'FIXTURE_COPY_BINDING');
    state.phase = 'copy_verify'; return call(state, 'document_read', { path: FILES.copy });
  }
  if (state.phase === 'copy_verify') {
    need(JSON.stringify(result).includes('副本乙'), 'FIXTURE_COPY_CONTENT'); state.phase = 'copy_done'; state.pending = null;
    return { content: '本地夹具：已按原稿哈希生成新副本，未覆盖原稿。' };
  }
  throw new Error('FIXTURE_UNKNOWN_PHASE');
}
function startFixture(log = () => {}, options = {}) {
  const state = makeFixtureState(); state.versionTools = options.versionTools === true; const sockets = new Set();
  const server = http.createServer((req, res) => {
    req.setEncoding('utf8'); // Preserve Chinese across HTTP chunk boundaries.
    let body = ''; let refused = false;
    const refuse = code => {
      if (refused) return; refused = true; state.stopped = true; state.errors.push(code);
      log({ kind: 'refused', code });
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":{"message":"local fixture refused"}}');
    };
    req.on('error', () => refuse('FIXTURE_REQUEST_ERROR'));
    req.on('data', chunk => { if (refused) return; body += chunk; if (Buffer.byteLength(body) > 1024 * 1024) refuse('FIXTURE_BODY_LIMIT'); });
    req.on('end', () => {
      if (refused) return;
      try {
        need(req.method === 'POST' && req.url === '/v1/chat/completions', 'FIXTURE_ROUTE');
        need(!options.deadline || Date.now() < options.deadline, 'FIXTURE_DEADLINE');
        need(++state.requests <= (state.versionTools ? 32 : 16), 'FIXTURE_REQUEST_LIMIT');
        const delta = fixtureStep(state, JSON.parse(body));
        log({ kind: delta.tool_calls ? delta.tool_calls[0].function.name : 'final', request: state.requests, phase: state.phase });
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
      } catch (error) { refuse(safeError(error)); }
    });
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  return { state, listen: () => new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/v1`));
  }), stop: () => { state.stopped = true; },
  close: () => new Promise(resolve => { state.stopped = true; for (const s of sockets) s.destroy(); server.close(resolve); }) };
}

function parseTaskNames(csv) {
  return csv.replace(/\r/g, '').split('\n').filter(line => line.trim()).map(line => {
    const match = /^(?:"((?:[^"]|"")*)"|([^,]+)),/.exec(line);
    need(match, 'TASK_QUERY_PARSE'); return (match[1] || match[2]).replace(/""/g, '"');
  });
}
function currentTasks(config) {
  // Query the exact task through Win7's local scheduler. The target schtasks
  // rejects CSV /NH; never classify its format or permission errors as absence.
  const name = config.task_name.replace(/'/g, "''");
  const script = `$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);` +
    `$s=New-Object -ComObject 'Schedule.Service';$s.Connect();$f=$s.GetFolder('\\');` +
    `try{$t=$f.GetTask('${name}');[xml]$x=$t.Xml;[Console]::WriteLine((@{exists=$true;path=[string]$t.Path;sid=[string]$x.Task.Principals.Principal.UserId}|ConvertTo-Json -Compress))}` +
    `catch{$e=$_.Exception;$missing=$false;while($null -ne $e){if($e.HResult -eq -2147024894){$missing=$true};$e=$e.InnerException};` +
    `if(-not $missing){throw};[Console]::WriteLine('{"exists":false}')}`;
  const result = cp.spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script, 'utf16le').toString('base64')],
    { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 32768 });
  need(!result.error && result.status === 0 && result.stdout.trim(), 'TASK_QUERY_FAILED');
  let task; try { task = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim()); } catch (_) { throw new Error('TASK_QUERY_PARSE'); }
  return taskNamesFromObservation(task, config);
}
function taskNamesFromObservation(task, config) {
  need(task && typeof task.exists === 'boolean', 'TASK_QUERY_PARSE');
  if (!task.exists) { need(Object.keys(task).length === 1, 'TASK_QUERY_PARSE'); return []; }
  need(Object.keys(task).length === 3 && typeof task.path === 'string'
    && task.path.toLowerCase() === ('\\' + config.task_name).toLowerCase()
    && task.sid === 'S-1-5-21-1708701742-428676696-1831205153-1001', 'TASK_QUERY_IDENTITY');
  return [task.path];
}
async function postflight(config) {
  currentIdentity(config);
  const file = path.join(config.run_root, 'POSTFLIGHT.json'); need(!fs.existsSync(file), 'POSTFLIGHT_REUSE');
  const r = { schema_version: 1, evidence_class: config.evidence_class, status: 'HALTED', source_commit: config.source_commit,
    zip_sha256: config.zip_sha256, driver_sha256: config.driver_sha256 };
  try {
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'POSTFLIGHT_DRIVER_HASH');
    const prior = JSON.parse(fs.readFileSync(path.join(config.run_root, 'RESULT.json'), 'utf8'));
    need(prior.status === 'PRODUCT_CHECKS_COMPLETE_POSTFLIGHT_REQUIRED' && prior.driver_sha256 === config.driver_sha256
      && prior.zip_sha256 === config.zip_sha256, 'POSTFLIGHT_PRIOR_RESULT');
    const rows = processRows();
    const own = observedTree(rows, process.pid)[0];
    const launchers = launcherInstances(rows, own, config);
    r.launcher_process_chain = launchers.slice(1);
    r.tasks = currentTasks(config); need(r.tasks.length === 0, 'POSTFLIGHT_TASK_REMAINS');
    r.processes = processObservation(prior.observed_process_tree, rows, config.session_id);
    r.unexpected_root_instances = rows.filter(row => row.image && [config.run_root,config.package_root,config.input_package_root].some(root => inside(root,row.image))
      && !launchers.some(known => known.pid === row.pid && known.created === row.created));
    need(r.processes.blocking_instances.length === 0 && r.unexpected_root_instances.length === 0, 'POSTFLIGHT_PROCESS_REMAINS');
    r.status = 'DEV_CHANNEL_COMPLETE';
  } catch (error) { r.first_failure = safeError(error); process.exitCode = 1; }
  fs.writeFileSync(file, JSON.stringify(r, null, 2) + '\n', { flag: 'wx' });
}

async function controller(config) {
  currentIdentity(config); // Never create evidence under an unverified identity.
  need(Date.now() < Date.parse(config.deadline_utc) - 600000, 'WINDOW_NO_NEW_SCENARIO');
  for (const target of [config.run_root, config.input_package_root, config.zip_path]) noLinks(ROOT, target);
  for (const target of [config.package_root, config.workspace_root, path.join(config.run_root, 'RESULT.json')]) need(!fs.existsSync(target), 'OUTPUT_REUSE');
  const report = path.join(config.run_root, 'RESULT.json');
  fs.writeFileSync(report, '{}\n', { flag: 'wx' });
  const result = { schema_version: 1, evidence_class: config.evidence_class, status: 'IN_PROGRESS',
    source_commit: config.source_commit, zip_sha256: config.zip_sha256, manifest_sha256: config.manifest_sha256,
    driver_sha256: config.driver_sha256, source_binding_sha256: config.source_binding_sha256,
    real_model_requests: 0, started_at: new Date().toISOString(), task_cleanup: 'NOT_PERFORMED_EXTERNAL_POSTFLIGHT_REQUIRED' };
  let observed = []; let observer; let observationError;
  try {
    result.identity = currentIdentity(config);
    const rows = processRows(); const own = launcherInstances(rows, result.identity, config);
    result.launcher_process_chain = own.slice(1);
    const unexpected = rows => rows.filter(row => row.image && [config.run_root, config.package_root, config.input_package_root].some(root => inside(root, row.image))
      && !own.some(known => known.pid === row.pid && known.created === row.created)
      && !observed.some(known => known.pid === row.pid && known.created === row.created));
    result.preexisting_trial_processes = unexpected(rows);
    need(result.preexisting_trial_processes.length === 0, 'PREEXISTING_TRIAL_PROCESS');
    need(currentTasks(config).length === 1, 'LAUNCHER_TASK_IDENTITY');
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'DRIVER_HASH');
    need(hash(fs.readFileSync(config.zip_path)) === config.zip_sha256, 'ZIP_HASH');
    result.binding = verifyBinding(config);
    result.original = verifyPackage(config, config.input_package_root);
    result.copy = copyPortablePackage(config);
    result.package = verifyPackage(config);
    need(hash(fs.readFileSync(config.cmd_path)) === hash(fs.readFileSync(path.join(process.env.SystemRoot, 'System32/cmd.exe'))), 'CMD_COPY_HASH');
    const runtime = prepareDriverRuntime(config);
    // Do not put mutable/unchecked executable paths into the strict input config.
    result.driver_runtime = runtime;
    fs.writeFileSync(path.join(config.run_root, 'runtime-config.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    save(report, result);
    need(Date.now() < Date.parse(config.deadline_utc) - 600000, 'WINDOW_NO_NEW_SCENARIO');
    const area = path.join(config.run_root, 'environment'); const env = cleanEnvironment(area, false);
    for (const key of ['LOCALAPPDATA','APPDATA','USERPROFILE','TEMP']) fs.mkdirSync(env[key], { recursive: true });
    const out = fs.openSync(path.join(config.run_root, 'ui-stdout.bin'), 'wx');
    const err = fs.openSync(path.join(config.run_root, 'ui-stderr.bin'), 'wx');
    try {
      result.exit = await new Promise((resolve, reject) => {
        const child = cp.spawn(runtime.executable, [runtime.app_root, '--ui', '--config', path.join(config.run_root, 'runtime-config.json'), '--portable'],
          { env, cwd: config.run_root, windowsHide: false, stdio: ['ignore', out, err] });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, Math.min(300000, Date.parse(config.deadline_utc) - Date.now()));
        observer = setInterval(() => {
          let rows;
          try {
            rows = processRows();
            if (!result.native_process_observations) result.native_process_observations = [];
            rows = resolveObservedRows(rows, observed, child.pid, config.session_id, row => probeProcessInstance(row, config), result.native_process_observations);
            observed = observed.length ? extendObservedTree(observed, rows, config.session_id) : observedTree(rows, child.pid);
            result.observed_process_tree = observed; save(report, result);
          } catch (error) {
            observationError = 'PROCESS_OBSERVATION_FAILED';
            if (!result.observation_failure) { result.observation_failure = observationFailure(error, child.pid, observed, rows); save(report, result); }
          }
        }, 1500);
        child.once('error', error => { clearTimeout(timer); clearInterval(observer); reject(error); });
        child.once('exit', (code, signal) => { clearTimeout(timer); clearInterval(observer); resolve({ pid: child.pid, code, signal, timed_out: timedOut }); });
      });
    } finally { fs.closeSync(out); fs.closeSync(err); }
    need(!result.exit.timed_out && result.exit.code === 0 && result.exit.signal === null, 'UI_EXIT_UNEXPECTED');
    if (observationError && fs.existsSync(path.join(config.run_root, 'ui-result.json'))) {
      try { const uiFailure = JSON.parse(fs.readFileSync(path.join(config.run_root, 'ui-result.json'), 'utf8'));
        result.ui_first_failure = /^[A-Z][A-Z0-9_]+$/.test(uiFailure.first_failure || '') ? uiFailure.first_failure : null;
      } catch (error) { result.ui_failure_read_error = safeError(error); }
    }
    need(!observationError, 'PROCESS_OBSERVATION_FAILED');
    result.ui = JSON.parse(fs.readFileSync(path.join(config.run_root, 'ui-result.json'), 'utf8'));
    for (const name of ['ui-stdout.bin','ui-stderr.bin']) need(!/a942-local-[a-f0-9]{32}/.test(fs.readFileSync(path.join(config.run_root, name), 'utf8')), 'SECRET_IN_PROCESS_LOG');
    need(result.ui.status === 'CHECKS_COMPLETE' && result.ui.normal_quit === true, 'UI_INCOMPLETE');
    // UI and controller must have observed the same actual account/session.
    need(result.ui.identity.sid === result.identity.sid && result.ui.identity.session === result.identity.session, 'UI_IDENTITY_DRIFT');
    for (const row of result.ui.process_tree) if (!observed.some(r => r.pid === row.pid && r.created === row.created)) observed.push(row);
    await waitFor(() => {
      const rows = resolveObservedRows(processRows(), observed, result.exit.pid, config.session_id, row => probeProcessInstance(row, config), result.native_process_observations || (result.native_process_observations=[])); observed = extendObservedTree(observed, rows, config.session_id);
      result.observed_process_tree = observed;
      result.last_process_observation = { at: new Date().toISOString(), ...processObservation(observed, rows, config.session_id), unexpected_root_instances: unexpected(rows) };
      save(report, result);
      return result.last_process_observation.blocking_instances.length === 0 && result.last_process_observation.unexpected_root_instances.length === 0;
    }, Math.min(40000, Date.parse(config.deadline_utc) - Date.now()), 'PRODUCT_TREE_ENDED');
    const Database = require(path.join(config.package_root, 'resources/native/storage/node_modules/better-sqlite3'));
    const db = new Database(path.join(config.data_root, 'a9/a9-state.db'), { readonly: true, fileMustExist: true });
    try {
      result.database = {
        workspace_locks: db.prepare('SELECT workspace_path,owner_id FROM a9_workspace_locks').all(),
        workspaces: db.prepare('SELECT workspace_path,permission_mode FROM a9_workspaces').all(),
        turns: db.prepare('SELECT turn_id,status FROM a9_turns').all(),
        questions: db.prepare("SELECT event_type,count(*) AS count FROM a9_events WHERE event_type IN ('question_pending','question_resolved') GROUP BY event_type").all(),
        tool_facts: db.prepare("SELECT turn_id,payload_json FROM a9_events WHERE event_type='tool_end'").all().map(r => {
          const p = JSON.parse(r.payload_json).data; need(p && p.toolName, 'SQLITE_EVENT_SCHEMA'); return { turn_id: r.turn_id, tool: p.toolName, result_sha256: hash(JSON.stringify(p)) };
        }),
      };
      const q = result.database.questions;
      need(q.find(r => r.event_type === 'question_pending' && r.count === 2)
        && q.find(r => r.event_type === 'question_resolved' && r.count === 2), 'SQLITE_QUESTION_FACTS');
      const events = db.prepare("SELECT payload_json FROM a9_events WHERE event_type='tool_end'").all().map(r => JSON.parse(r.payload_json).data);
      for (const tool of ['document_write_copy','document_read','document_inspect']) need(events.some(e => e.toolName === tool && typeof e.result === 'string' && !JSON.parse(e.result).error), 'SQLITE_TOOL_FACTS');
    } finally { db.close(); }
    need(result.database.workspace_locks.length === 0, 'PRODUCT_LOCK_REMAINS');
    need(result.database.workspaces.length === 1 && result.database.workspaces[0].workspace_path === path.win32.resolve(config.workspace_root).toLowerCase()
      && result.database.workspaces[0].permission_mode === 'full_access', 'WORKSPACE_PERSISTENCE');
    need(result.database.turns.length >= 3 && !result.database.turns.some(r => ['active','interrupted','failed'].includes(r.status)), 'TURN_PERSISTENCE');
    result.launcher_tasks = currentTasks(config);
    need(result.launcher_tasks.length === 1, 'LAUNCHER_TASK_IDENTITY');
    result.package_after = verifyPackage(config); result.original_after = verifyPackage(config, config.input_package_root);
    result.status = 'PRODUCT_CHECKS_COMPLETE_POSTFLIGHT_REQUIRED';
  } catch (error) { result.status = 'HALTED'; result.first_failure = safeError(error); process.exitCode = 1; }
  finally {
    clearInterval(observer); result.ended_at = new Date().toISOString(); save(report, result);
    process.stdout.write(JSON.stringify({ status: result.status, first_failure: result.first_failure || null }) + '\n');
  }
}

async function ui(config) {
  const { app, BrowserWindow, dialog, ipcMain } = require('electron');
  const report = path.join(config.run_root, 'ui-result.json');
  const result = { schema_version: 1, evidence_class: config.evidence_class, status: 'IN_PROGRESS', normal_quit: false,
    checks: [], ipc: [], fixture: [], source_commit: config.source_commit, zip_sha256: config.zip_sha256 };
  const persist = () => save(report, result);
  const check = (name, ok) => { result.checks.push({ name, ok: Boolean(ok) }); persist(); need(ok, name); };
  let win; let fixture; let deadlineTimer;
  const evaluate = code => win.webContents.executeJavaScript(code);
  const wait = (fn, ms, name) => waitFor(fn, Math.min(ms, Date.parse(config.deadline_utc) - Date.now()), name);
  const snapshot = async () => {
    const r = await evaluate('window.win7Agent.a9.snapshot()'); need(r && r.ok && r.snapshot, 'SNAPSHOT_FAILED'); return r.snapshot;
  };
  const click = async selector => {
    result.last_action = { kind: 'click', selector }; persist();
    await clickUi({ evaluate, focus: () => win.focus(), sendInputEvent: event => win.webContents.sendInputEvent(event) }, selector);
  };
  const fill = async (selector, value) => {
    await click(selector);
    await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await win.webContents.insertText(value);
    await wait(() => evaluate(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}`), 5000, 'INPUT_VALUE');
  };
  const submit = async prompt => {
    need(Date.now() < Date.parse(config.deadline_utc) - 600000, 'WINDOW_NO_NEW_SCENARIO');
    if (await evaluate('!document.getElementById("inspector-backdrop").hidden')) {
      await click('#close-inspector');
      await wait(() => evaluate('document.getElementById("inspector-backdrop").hidden'), 10000, 'INSPECTOR_DRAWER_CLOSED');
    }
    await wait(() => evaluate('!document.getElementById("task-prompt").disabled'), 10000, 'COMPOSER_READY');
    await fill('#task-prompt', prompt);
    await wait(() => evaluate('!document.getElementById("run-task").disabled'), 10000, 'SUBMIT_READY');
    need(Date.now() < Date.parse(config.deadline_utc) - 600000, 'WINDOW_NO_NEW_SCENARIO');
    await click('#run-task');
  };
  const completed = phase => wait(async () => {
    const s = await snapshot(); return fixture.state.phase === phase && !s.pendingQuestion && ['completed','completed_with_warnings'].includes(s.agentStatus) ? s : null;
  }, 45000, 'TURN_COMPLETED');
  const screenshot = async name => {
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(config.run_root, name + '.png'), (await win.webContents.capturePage()).toPNG(), { flag: 'wx' });
  };
  dialog.showOpenDialog = async (_owner, options) => {
    need(options && options.properties && options.properties.includes('openDirectory'), 'UNEXPECTED_FILE_PICKER');
    return { canceled: false, filePaths: [config.workspace_root] };
  };
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
    const response = await listener(...args);
    if (channel === 'product:a9-request') {
      const action = args[1] && args[1].action;
      result.ipc.push({ action, ok: response && response.ok === true,
        ...(action === 'a9.checkpoint.undoTurn' && response ? { outcome: response.outcome } : {}) });
      need(result.ipc.length <= 1200, 'IPC_LOG_LIMIT');
    }
    return response;
  });
  app.on('will-quit', () => { clearTimeout(deadlineTimer); result.normal_quit = true; persist(); });
  try {
    result.identity = currentIdentity(config);
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'UI_DRIVER_HASH');
    check('PORTABLE_FLAG', process.argv.includes('--portable'));
    need(!fs.existsSync(config.workspace_root) && !fs.existsSync(config.data_root), 'UI_OUTPUT_REUSE');
    fs.mkdirSync(config.workspace_root);
    lightweight.seed(config.workspace_root, require('electron').nativeImage);
    app.setPath('crashDumps', path.join(config.run_root, 'environment/temp'));
    fixture = startFixture(entry => { result.fixture.push(entry); persist(); }, { deadline: Date.parse(config.deadline_utc), versionTools: true });
    const url = await fixture.listen();
    const sentinel = 'a942-local-' + crypto.randomBytes(16).toString('hex');
    // Only a hash is persisted. No request bodies, credentials, or raw errors are logged.
    result.secret_sentinel_sha256 = hash(sentinel);
    require(path.join(config.package_root, 'resources/app/product/main.js'));
    check('PRODUCT_DATA_ROOT', app.getPath('userData') === config.data_root);
    await app.whenReady();
    win = await wait(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/renderer/workbench.html')), 30000, 'WORKBENCH');
    deadlineTimer = setTimeout(() => { fixture.stop(); result.status = 'HALTED'; result.first_failure = 'WINDOW_DEADLINE'; persist(); win.close(); }, Math.max(1, Date.parse(config.deadline_utc) - Date.now()));
    await wait(() => evaluate('document.readyState==="complete"&&Boolean(window.win7Agent&&window.win7Agent.a9)'), 20000, 'RENDERER');
    await wait(() => win.isVisible() && !win.isMinimized(), 15000, 'VISIBLE');
    await click('#workspace-select');
    await wait(async () => (await snapshot()).activeConversationId, 20000, 'WORKSPACE');
    await wait(() => evaluate('document.getElementById("a9-mode-dialog").open'), 10000, 'MODE_DIALOG');
    await click('input[name="a9-mode-choice"][value="full_access"]'); await click('#a9-mode-apply');
    await wait(async () => (await snapshot()).mode === 'full_access', 10000, 'FULL_ACCESS');
    await click('#a9-provider-open');
    await fill('#a9-provider-url', url); await fill('#a9-provider-model', 'a942-local-scripted'); await fill('#a9-provider-key', sentinel);
    check('REMEMBER_OFF', await evaluate('!document.getElementById("a9-provider-remember").checked'));
    await click('#a9-provider-apply');
    await wait(() => evaluate('!document.getElementById("a9-provider-apply").disabled&&document.getElementById("a9-provider-probe-state").textContent==="tool_calling"'), 20000, 'PROBE');
    await click('#settings-drawer header [data-close]');
    result.workbench = await lightweight.workbench({ win, evaluate, click, wait, snapshot }); persist();
    const toolTurn = async kind => {
      await submit('a943:tools:' + kind);
      await wait(async () => { const s = await snapshot(); return fixture.state.lightweight && fixture.state.lightweight.done
        && fixture.state.lightweight.kind === kind && ['completed','completed_with_warnings'].includes(s.agentStatus); }, 45000, 'VERSION_TOOLS_COMPLETED');
    };
    const images = async enabled => {
      // The healthy Provider chip is intentionally hidden; settings remains visible.
      await click('#open-settings');
      await evaluate(`document.getElementById('a9-provider-images').checked=${enabled}`);
      await click('#a9-provider-apply');
      await wait(() => evaluate('!document.getElementById("a9-provider-apply").disabled'), 20000, 'PROVIDER_UPDATED');
      await click('#settings-drawer header [data-close]');
    };
    await toolTurn('off');
    check('VERSION_EDIT_ON_DISK', fs.readFileSync(path.join(config.workspace_root, lightweight.NOTE), 'utf8') === '第一行\n新锚点\n第三行\n');
    await images(true); await toolTurn('on');
    check('IMAGE_METADATA_IN_STATE', (await snapshot()).timeline.some(e => e.data && e.data.toolName === 'read_image'));
    await images(false); await toolTurn('released');
    result.version_tools = fixture.state.lightweight.results; persist();
    await submit('a942:office:new');
    const waiting = await wait(async () => { const s = await snapshot(); return s.agentStatus === 'needs_input' && s.pendingQuestion ? s : null; }, 20000, 'QUESTION');
    const requests = fixture.state.requests;
    // Observe genuine product idle behavior; snapshot polling does not cause model dispatch.
    await delay(1200);
    check('UNANSWERED_NO_REDISPATCH_OR_WRITE', fixture.state.requests === requests && fs.readdirSync(config.workspace_root).every(f => !/\.(docx|xlsx)$/.test(f)));
    check('QUESTION_CARD_VISIBLE', await evaluate('!document.getElementById("a9-question-host").hidden'));
    await screenshot('question');
    fixture.state.phase = 'answer_allowed';
    await click('#a9-question-card input[type="radio"]'); await click('#a9-question-card .a9-question-actions button:first-child');
    const created = await completed('new_done'); result.new_turns = created.checkpoints.map(c => c.turnId);
    need(fixture.state.phase === 'new_done', 'NEW_FIXTURE_INCOMPLETE');
    result.original_sha256 = hash(fs.readFileSync(path.join(config.workspace_root, FILES.doc)));
    result.book_sha256 = hash(fs.readFileSync(path.join(config.workspace_root, FILES.book)));
    check('REAL_OFFICE_FILES', fs.readFileSync(path.join(config.workspace_root, FILES.doc)).subarray(0,2).toString() === 'PK'
      && fs.readFileSync(path.join(config.workspace_root, FILES.book)).subarray(0,2).toString() === 'PK');
    const beforeCopy = new Set((await snapshot()).checkpoints.map(c => c.turnId));
    await submit('a942:office:copy'); const copied = await completed('copy_done');
    const copyTurns = copied.checkpoints.filter(c => !beforeCopy.has(c.turnId));
    need(copyTurns.length === 1, 'COPY_CHECKPOINT_COUNT');
    result.copy_turn = copyTurns[0].turnId;
    need(typeof result.copy_turn === 'string', 'COPY_TURN_ID');
    check('COPY_SOURCE_BOUND_ORIGINAL_UNCHANGED', fixture.state.phase === 'copy_done' && fixture.state.sourceHash === result.original_sha256
      && hash(fs.readFileSync(path.join(config.workspace_root, FILES.doc))) === result.original_sha256
      && hash(fs.readFileSync(path.join(config.workspace_root, FILES.copy))) !== result.original_sha256);
    result.phase = 'office_tool_records'; persist();
    for (let i = 0; i < 12 && await evaluate('Boolean(document.querySelector("#a9-task-stream .activity-group:not([open]) > summary"))'); i += 1) {
      await click('#a9-task-stream .activity-group:not([open]) > summary');
    }
    result.dom_tools = await evaluate('document.getElementById("a9-task-stream").innerText');
    check('UI_OFFICE_TOOL_RECORDS', await evaluate('["document_write_copy","document_read","document_inspect"].every(name=>Array.from(document.querySelectorAll("#a9-task-stream .activity-tool")).some(e=>e.title===name))'));
    check('UI_REAL_TOOL_FACTS', [FILES.doc,FILES.copy].every(f => result.dom_tools.includes(f)));
    if (!await evaluate('document.getElementById("open-inspector").getAttribute("aria-expanded")==="true"')) {
      await click('#open-inspector');
    }
    await wait(() => evaluate('document.getElementById("open-inspector").getAttribute("aria-expanded")==="true"&&document.getElementById("inspector-tab-changes").getBoundingClientRect().width>0'), 10000, 'INSPECTOR_OPEN');
    await click('#inspector-tab-changes');
    await screenshot('office-copy');
    await click(`button[aria-label="撤销 ${result.copy_turn}"]`);
    await wait(() => !fs.existsSync(path.join(config.workspace_root, FILES.copy)), 15000, 'CHECKPOINT_UNDO');
    check('UNDO_ORIGINAL_AND_BOOK_PRESERVED', hash(fs.readFileSync(path.join(config.workspace_root, FILES.doc))) === result.original_sha256
      && hash(fs.readFileSync(path.join(config.workspace_root, FILES.book))) === result.book_sha256
      && await evaluate('document.getElementById("a9-undo-state").textContent.includes("已撤销")'));
    await submit('a942:office:cancel');
    const cancel = await wait(async () => { const s = await snapshot(); return s.pendingQuestion && s.pendingQuestion.questionId !== waiting.pendingQuestion.questionId ? s.pendingQuestion : null; }, 15000, 'CANCEL_QUESTION');
    const beforeCancel = fixture.state.requests;
    await click('#a9-question-card .a9-question-actions button:last-child');
    await wait(async () => !(await snapshot()).pendingQuestion, 10000, 'QUESTION_CANCELLED');
    // A late reply uses the real preload and strict IPC; no Runtime reference is obtained.
    const late = await evaluate(`window.win7Agent.a9.replyQuestion(${JSON.stringify(cancel.conversationId)},${JSON.stringify(cancel.questionId)},${cancel.revision},'answered','小样本')`);
    await delay(1200);
    check('CANCEL_LATE_REPLY_NO_REDISPATCH', late && late.ok === false && fixture.state.requests === beforeCancel
      && !fs.existsSync(path.join(config.workspace_root, FILES.poison)));
    check('NO_FIXTURE_ERRORS', fixture.state.errors.length === 0);
    check('RENDERER_ISOLATED', await evaluate('typeof require==="undefined"&&typeof process==="undefined"'));
    // Scan full real DB projections while the sentinel is memory-only.
    const Database = require(path.join(config.package_root, 'resources/native/storage/node_modules/better-sqlite3'));
    const db = new Database(path.join(config.data_root, 'a9/a9-state.db'), { readonly: true, fileMustExist: true });
    try { check('SECRET_NOT_IN_STATE', !JSON.stringify(db.prepare('SELECT payload_json FROM a9_events').all()).includes(sentinel)); } finally { db.close(); }
    result.fixture_requests = fixture.state.requests;
    result.process_tree = observedTree(processRows(), process.pid);
    await screenshot('undo-and-cancel');
    fixture.stop(); await fixture.close(); fixture = null;
    result.status = 'CHECKS_COMPLETE'; persist(); win.close();
  } catch (error) {
    result.status = 'HALTED'; result.first_failure = safeError(error);
    if (win && !win.isDestroyed()) {
      try { await screenshot('failure'); result.failure_screenshot = 'failure.png'; }
      catch (_) { result.failure_screenshot = 'CAPTURE_FAILED'; }
    }
    try { result.process_tree = observedTree(processRows(), process.pid); } catch (_) { result.process_query = 'UNKNOWN'; }
    persist(); if (fixture) { await fixture.close(); fixture = null; }
    if (win) win.close(); else app.quit();
  }
}
module.exports = { probeProcessInstance, resolveObservedRows, observationFailure, driverClosure, copyDriverClosure, verifyDriverClosure, validateConfig, canonical, noLinks, verifyPackage, verifyBinding, hash, safeError,
  makeFixtureState, fixtureStep, startFixture, DOC, COPY, BOOK, FILES, processObservation, parseTaskNames, launcherInstances, taskNamesFromObservation, clickUi, inside, processRows, observedTree, extendObservedTree, cleanEnvironment,
  currentIdentity, currentTasks, copyPortablePackage, waitFor, EXECUTION_LAYOUT, loadExecutionBinding, expandExecutionLayout,
  taskNameFor, rejectDriverOverrides, executionBindingPathFor };
if (require.main === module) {
  try {
    const args = process.argv.slice(2); const at = args.indexOf('--config'); need(at >= 0, 'CONFIG_ARGUMENT');
    const configFile = path.resolve(args[at + 1]);
    rejectDriverOverrides(args);
    const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const config = validateConfig(raw, Date.now(), false, { executionBindingPath: raw.execution_binding_path });
    need(inside(config.run_root, path.resolve(configFile)), 'CONFIG_LOCATION');
    noLinks(config.run_root, path.resolve(configFile));
    Promise.resolve(args.includes('--ui') ? ui(config) : args.includes('--postflight') ? postflight(config) : controller(config)).catch(error => {
      process.stderr.write(safeError(error) + '\n'); process.exitCode = 1;
    });
  } catch (error) { process.stderr.write(safeError(error) + '\n'); process.exitCode = 1; }
}
