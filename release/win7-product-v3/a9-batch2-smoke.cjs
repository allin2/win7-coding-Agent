// A9-39 batch2 smoke runner (candidate identity from fixtures; ADR-0155 Proposed).
//
// One invocation = one approved phase attempt (see a9-batch2-desktop-request.cjs). The phase scripts are:
//   p01-env        target identity, runtime, shell, codepage, patches, space and process-tree admission (G0)
//   p03..p08       packaged driver processes against the real product entry, with a loopback Provider (G2)
//   p10-postflight secret scan with a positive control, process residue and the evidence manifest (G4)
// p02 (package integrity) and p09 (report verification) have their own scripts. Raw files are written before any verdict;
// the verdict is derived from the contract assertions in a9-batch2-fixtures.cjs and written last as phase-result.json.
// A controller success is never a product success: every PASS comes from observed facts. Runs under the packaged
// electron.exe in ELECTRON_RUN_AS_NODE=1 mode; Windows only for the real phases, pure parts run anywhere.
'use strict';

// Electron patches fs to virtualize .asar paths. The driver runtime copy must move the physical default_app.asar bytes
// to a candidate-external folder, so asar virtualization is switched off before anything else runs (same remedy as the
// WIN7-42 smoke; the first rehearsal of this suite stopped at p03 with "ENOENT, not found in ...default_app.asar").
process.noAsar = true;

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const fixtures = require('./a9-batch2-fixtures.cjs');
const requests = require('./a9-batch2-desktop-request.cjs');

const CONTRACT = fixtures.CONTRACT;
const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30000;

// ---- Small utilities ------------------------------------------------------------------------------

function sha256Bytes(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function sha256File(file) { return sha256Bytes(fs.readFileSync(file)); }
function argument(argv, name, fallback = '') {
  const prefix = `--${name}=`;
  const value = argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// ---- Fixed command runner ---------------------------------------------------------------------------
// Only the commands named here may run; arguments are literals or validated integers, never request text.

const FIXED_COMMANDS = Object.freeze({
  ver: { file: 'cmd.exe', args: ['/d', '/c', 'ver'] },
  chcp: { file: 'cmd.exe', args: ['/d', '/c', 'chcp'] },
  whoami_user: { file: 'whoami.exe', args: ['/user', '/fo', 'csv', '/nh'] },
  whoami_groups: { file: 'whoami.exe', args: ['/groups', '/fo', 'csv', '/nh'] },
  powershell_version: { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'] },
  powershell_codepages: { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command',
    "[Console]::OutputEncoding.CodePage.ToString() + ',' + [System.Text.Encoding]::Default.CodePage.ToString()"] },
  wmic_os: { file: 'wmic.exe', args: ['os', 'get', 'Version,CSDVersion,OSArchitecture,BuildNumber', '/format:csv'] },
  wmic_hotfix: { file: 'wmic.exe', args: ['qfe', 'get', 'HotFixID', '/format:csv'] },
  wmic_processes: { file: 'wmic.exe', args: ['process', 'get', 'ProcessId,ParentProcessId,Name,ExecutablePath,SessionId,CreationDate', '/format:csv'] },
  wmic_process_commands: { file: 'wmic.exe', args: ['process', 'get', 'ProcessId,CommandLine', '/format:list'] },
});

const STDOUT_CAP = 262144;

function realExec(name, extra) {
  const spec = FIXED_COMMANDS[name] || (extra && extra.dynamic);
  if (!spec) throw new Error(`A9_BATCH2_COMMAND_NOT_ALLOWED:${name}`);
  const result = childProcess.spawnSync(spec.file, spec.args, { windowsHide: true, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
  const stdout = String(result.stdout || '');
  // Output beyond the cap is cut off, and a cut-off listing cannot show that anything is absent: it is reported as an error and flagged.
  const truncated = stdout.length > STDOUT_CAP;
  return { status: result.status, stdout: stdout.slice(0, STDOUT_CAP), stderr: String(result.stderr || '').slice(0, 8192),
    error: result.error ? String(result.error.message || result.error).slice(0, 300) : truncated ? `stdout_truncated:${stdout.length}` : null, truncated };
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; } else if (char === '"') quoted = false; else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { out.push(current); current = ''; } else current += char;
  }
  out.push(current);
  return out;
}
// wmic /format:csv: a blank line, then "Node,Col1,Col2..." and one row per object (columns in alphabetical order).
// With completeOnly, a row that has fewer cells than the header (for example the last row of a cut-off listing) is dropped.
function parseWmicCsv(text, options) {
  const lines = String(text || '').split(/\r?\r?\n/).map((line) => line.replace(/\r/g, '')).filter((line) => line.trim() !== '');
  if (lines.length < 1) return [];
  const header = parseCsvLine(lines[0]);
  const completeOnly = Boolean(options && options.completeOnly);
  return lines.slice(1).map((line) => parseCsvLine(line)).filter((cells) => !completeOnly || cells.length === header.length).map((cells) => {
    const row = {};
    header.forEach((name, index) => { row[name] = cells[index] === undefined ? '' : cells[index]; });
    return row;
  });
}

// Strict reading of one wmic CSV line. wmic does not quote its cells, so a quote may only open a cell, and a quoted cell must be closed and
// followed by a comma or the end of the line. null means the line is not well formed; parseCsvLine above is lenient and pads or rejoins.
function parseCsvLineStrict(line) {
  const out = [];
  let index = 0;
  for (;;) {
    let cell = '';
    if (line[index] === '"') {
      index += 1;
      let closed = false;
      while (index < line.length) {
        if (line[index] === '"') {
          if (line[index + 1] === '"') { cell += '"'; index += 2; continue; }
          closed = true;
          index += 1;
          break;
        }
        cell += line[index];
        index += 1;
      }
      if (!closed || (index < line.length && line[index] !== ',')) return null;
    } else {
      while (index < line.length && line[index] !== ',') {
        if (line[index] === '"') return null;
        cell += line[index];
        index += 1;
      }
    }
    out.push(cell);
    if (index >= line.length) return out;
    index += 1;
  }
}
// A table is intact only when its header names are non-empty and unique and every line reads strictly and has as many cells as the header.
// A line that does not is dropped from rows (a complete line is still evidence of presence) and the table is no proof of absence: whatever
// is missing from a table with a broken line may be exactly the line that broke.
function readWmicTable(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.replace(/\r/g, '')).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { rows: [], intact: false, problem: 'empty_output' };
  const header = parseCsvLineStrict(lines[0]);
  if (!header || header.some((name) => name.trim() === '') || new Set(header).size !== header.length) return { rows: [], intact: false, problem: 'header_invalid' };
  const rows = [];
  let problem = null;
  lines.slice(1).forEach((line, index) => {
    const cells = parseCsvLineStrict(line);
    if (!cells || cells.length !== header.length) {
      if (problem === null) problem = `row_${index + 2}_${cells ? 'cell_count' : 'quoting'}`;
      return;
    }
    const row = {};
    header.forEach((name, column) => { row[name] = cells[column]; });
    rows.push(row);
  });
  if (problem === null && rows.length === 0) problem = 'no_rows';
  return { rows, intact: problem === null, problem };
}

// wmic /format:list prints one block per object: one "Key=Value" line per property, a blank line between blocks. A value may hold commas and
// quotes, so a command line reads safely here where csv cannot carry it. Strict like readWmicTable: a line that is not "Key=Value" for a
// requested key, or a block that lacks a requested key or repeats one, means the listing proves nothing about absence. A complete block is
// still returned as evidence of presence. problem names the first defect and never quotes the output.
function readWmicList(text, keys) {
  const lines = String(text || '').split('\n').map((line) => line.replace(/\r/g, ''));
  if (lines.every((line) => line.trim() === '')) return { rows: [], intact: false, problem: 'empty_output' };
  const rows = [];
  let problem = null;
  let count = 0;
  let block = null;
  let damaged = false;
  const finish = () => {
    if (block === null) return;
    count += 1;
    if (!damaged && keys.every((key) => block.has(key))) rows.push(Object.fromEntries(block));
    else if (problem === null) problem = `block_${count}_${damaged ? 'line' : 'keys'}`;
    block = null;
    damaged = false;
  };
  for (const line of lines) {
    if (line.trim() === '') { finish(); continue; }
    if (block === null) block = new Map();
    const at = line.indexOf('=');
    const key = at > 0 ? line.slice(0, at) : '';
    if (!keys.includes(key) || block.has(key)) { damaged = true; continue; }
    block.set(key, line.slice(at + 1));
  }
  finish();
  return { rows, intact: problem === null, problem };
}

const DIGITS = /^\d+$/;
const COMMAND_LINE_KEYS = ['ProcessId', 'CommandLine'];
// wmic cannot read the image path of a process whose first thread never ran (observed on Win7: an orphaned Chromium helper of a killed
// driver, one thread, no CPU time, ExecutablePath empty, command line intact). Such a process holds the driver runtime copy mapped and no
// table row names its image. Its command line does, so a second query supplies it. Command lines are only a fallback for empty paths.
function listCommandLines(exec) {
  let result;
  try { result = exec('wmic_process_commands'); } catch (_error) { return { byPid: new Map(), failed: true, problem: 'exec_threw' }; }
  if (!result) return { byPid: new Map(), failed: true, problem: 'no_result' };
  const list = readWmicList(result.stdout, COMMAND_LINE_KEYS);
  const byPid = new Map();
  let problem = list.problem;
  for (const row of list.rows) {
    if (DIGITS.test(row.ProcessId.trim())) byPid.set(row.ProcessId.trim(), row.CommandLine);
    else if (problem === null) problem = 'process_id';
  }
  if (result.status !== 0 || result.error || result.truncated === true) {
    return { byPid, failed: true, problem: result.truncated === true ? 'truncated' : result.error ? 'command_error' : 'exit_status' };
  }
  return { byPid, failed: problem !== null, problem };
}
// The image a row runs from: its ExecutablePath, or when wmic left that empty, the start of its command line (one leading quote removed).
function withImagePath(rows, commandLines) {
  return rows.map((row) => {
    const executable = String(row.ExecutablePath || '');
    if (executable !== '') return { ...row, ImagePath: executable, ImageSource: 'executable_path' };
    const command = String(commandLines.get(String(row.ProcessId).trim()) || '').replace(/^"/, '');
    return { ...row, ImagePath: command, ImageSource: command === '' ? 'none' : 'command_line' };
  });
}

// A process listing is observed only when the command ran, exited 0, reported no error, was not cut off and printed an intact table. A thrown error,
// a non-zero status, an error object, a cut-off output or a table with a broken line means the rows are partial and prove nothing about
// absence: callers must not turn them into "absent". The complete rows such a listing did print are still evidence of presence, so they are
// kept (failed is true) and a survivor or residue found in them is a failure. problem names the first defect and never quotes the output.
// Every row carries ImagePath and ImageSource; the command-line query must be intact too, or the listing fails (command_lines_<problem>).
function listProcesses(exec) {
  let result;
  try { result = exec('wmic_processes'); } catch (_error) { return { rows: [], failed: true, problem: 'exec_threw' }; }
  if (!result) return { rows: [], failed: true, problem: 'no_result' };
  const table = readWmicTable(result.stdout);
  if (result.status !== 0 || result.error || result.truncated === true) {
    return { rows: withImagePath(table.rows, new Map()), failed: true, problem: result.truncated === true ? 'truncated' : result.error ? 'command_error' : 'exit_status' };
  }
  const commands = listCommandLines(exec);
  const rows = withImagePath(table.rows, commands.byPid);
  if (!table.intact) return { rows, failed: true, problem: table.problem };
  return { rows, failed: commands.failed, problem: commands.failed ? `command_lines_${commands.problem}` : null };
}

// ---- Environment (G0) -----------------------------------------------------------------------------------

function collectEnvironment(exec, context) {
  const run = (name) => { try { return exec(name); } catch (error) { return { status: null, stdout: '', stderr: '', error: String(error && error.message ? error.message : error) }; } };
  const listing = listProcesses(exec);
  const processes = listing.rows;
  const selfPid = context.pid;
  const own = new Set([selfPid]);
  // Walk up the parent chain so this runner and its controllers are not counted as stale trees.
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of processes) {
      if (own.has(Number(row.ProcessId)) && !own.has(Number(row.ParentProcessId)) && Number(row.ParentProcessId) > 0) { own.add(Number(row.ParentProcessId)); grew = true; }
    }
  }
  const normalizedRoots = (context.watchedRoots || []).map((item) => String(item).toLowerCase());
  const stale = processes.filter((row) => {
    if (own.has(Number(row.ProcessId))) return false;
    const exe = String(row.ImagePath || '').toLowerCase();
    const name = String(row.Name || '').toLowerCase();
    return normalizedRoots.some((root) => root && exe.startsWith(root)) || ['spike02_helper.exe', 'helper.exe'].includes(name);
  }).map((row) => ({ pid: Number(row.ProcessId), parent: Number(row.ParentProcessId), name: row.Name, path: String(row.ImagePath).slice(0, 260), image_source: row.ImageSource, session: Number(row.SessionId) }));
  const sessionRow = processes.find((row) => Number(row.ProcessId) === selfPid);
  const os1 = parseWmicCsv(run('wmic_os').stdout)[0] || {};
  return {
    node: { electron: process.versions.electron || null, node: process.versions.node, modules: process.versions.modules,
      exec_path: process.execPath, platform: process.platform, arch: process.arch, os_release: os.release(), hostname: os.hostname() },
    ver: run('ver').stdout.trim(),
    chcp: run('chcp').stdout.trim(),
    wmic_os: { version: os1.Version || null, service_pack: os1.CSDVersion || null, architecture: os1.OSArchitecture || null, build: os1.BuildNumber || null },
    whoami_user: run('whoami_user').stdout.trim(),
    whoami_groups: run('whoami_groups').stdout.trim(),
    session_id: sessionRow ? Number(sessionRow.SessionId) : null,
    powershell_version: run('powershell_version').stdout.trim() || null,
    powershell_codepages: run('powershell_codepages').stdout.trim() || null,
    hotfixes: parseWmicCsv(run('wmic_hotfix').stdout).map((row) => row.HotFixID).filter(Boolean),
    hotfix_command_status: run('wmic_hotfix').status,
    processes_total: processes.length,
    processes_listing_failed: listing.failed,
    stale_processes: stale,
    free_bytes: context.freeBytes === undefined ? null : context.freeBytes,
    controller_identity: context.controllerIdentity || null,
  };
}

function parseWhoamiSid(text) {
  const cells = parseCsvLine(String(text || '').split(/\r?\n/)[0] || '');
  return { account: cells[0] || null, sid: cells[1] || null };
}
function parseIntegrity(groups) {
  const text = String(groups || '');
  if (/S-1-16-4096/.test(text)) return 'Low';
  if (/S-1-16-8192/.test(text)) return 'Medium';
  if (/S-1-16-12288/.test(text)) return 'High';
  if (/S-1-16-16384/.test(text)) return 'System';
  return null;
}

// Returns [{ assertion_id, status, observed }] for the G0 case; UNKNOWN facts never pass.
function evaluateEnvironment(facts, request, candidateRoot) {
  const caseId = 'B2-G0-ENV';
  const ids = fixtures.CASES.find((item) => item.case_id === caseId).assertions.map((a) => a.assertion_id);
  const out = [];
  const add = (index, status, observed) => out.push({ case_id: caseId, assertion_id: ids[index], status, observed });
  const target = request.target;
  // A01
  const buildOk = /\b6\.1\.7601\b/.test(String(facts.ver || '')) && facts.node.arch === 'x64'
    && String(facts.wmic_os.service_pack || '').includes('Service Pack 1') && String(facts.wmic_os.build || '') === '7601';
  const machineOk = String(facts.node.hostname || '').toLowerCase() === String(target.machine_name).toLowerCase();
  if (!facts.ver || !facts.wmic_os.build) add(0, 'UNKNOWN', 'OS version facts missing');
  else if (!buildOk || !machineOk) add(0, 'FAIL', `ver=${facts.ver}; build=${facts.wmic_os.build}; sp=${facts.wmic_os.service_pack}; arch=${facts.node.arch}; host=${facts.node.hostname}`);
  else if (facts.stale_processes.length > 0) add(0, 'FAIL', `stale_processes=${JSON.stringify(facts.stale_processes).slice(0, 600)}`);
  else if (facts.processes_listing_failed === true || !(facts.processes_total > 0)) add(0, 'UNKNOWN', `the process listing failed or was empty (listing_failed=${facts.processes_listing_failed === true}; processes_total=${facts.processes_total}); stale trees were not observed`);
  else add(0, 'PASS', `Windows 7 SP1 build 7601 x64 on ${facts.node.hostname}; stale_processes=0 of ${facts.processes_total}`);
  // A02
  const who = parseWhoamiSid(facts.whoami_user);
  const integrity = parseIntegrity(facts.whoami_groups);
  const controller = facts.controller_identity;
  if (!who.sid || !integrity || facts.session_id === null || !controller) add(1, 'UNKNOWN', `sid=${who.sid}; integrity=${integrity}; session=${facts.session_id}; controller_identity=${controller ? 'present' : 'missing'}`);
  else {
    const match = who.sid === target.account_sid && who.account.toLowerCase() === String(target.account_name).toLowerCase()
      && integrity === target.integrity_level && facts.session_id === target.session_id && controller.elevated === false
      && controller.account_sid === who.sid && controller.session_id === facts.session_id && typeof controller.in_job === 'boolean'
      && controller.in_job === target.in_job;
    add(1, match ? 'PASS' : 'FAIL', `sid=${who.sid}; account=${who.account}; integrity=${integrity}; session=${facts.session_id}; elevated=${controller.elevated}; in_job=${controller.in_job}`);
  }
  // A03
  const runtimeOk = facts.node.electron === '22.3.27' && facts.node.node === '16.17.1' && String(facts.node.modules) === '110'
    && path.basename(facts.node.exec_path).toLowerCase() === 'electron.exe' && contained(candidateRoot, facts.node.exec_path);
  add(2, runtimeOk ? 'PASS' : 'FAIL', `electron=${facts.node.electron}; node=${facts.node.node}; abi=${facts.node.modules}; exec=${facts.node.exec_path}`);
  // A04
  if (!facts.powershell_version || !facts.powershell_codepages || !facts.chcp || facts.hotfix_command_status !== 0) {
    add(3, 'UNKNOWN', `powershell=${facts.powershell_version}; codepages=${facts.powershell_codepages}; chcp=${facts.chcp}; hotfix_status=${facts.hotfix_command_status}`);
  } else add(3, 'PASS', `powershell=${facts.powershell_version}; codepages(oem,ansi)=${facts.powershell_codepages}; chcp=${facts.chcp}; hotfixes=${facts.hotfixes.length} (${facts.hotfixes.slice(0, 12).join(',')})`);
  // A05
  if (facts.free_bytes === null) add(4, 'UNKNOWN', 'free space unknown');
  else if (contained(candidateRoot, request.evidence_root) || facts.free_bytes < MIN_FREE_BYTES) add(4, 'FAIL', `free_bytes=${facts.free_bytes}; min=${MIN_FREE_BYTES}; evidence_inside_candidate=${contained(candidateRoot, request.evidence_root)}`);
  else add(4, 'PASS', `free_bytes=${facts.free_bytes}; evidence_root outside candidate`);
  return out;
}

// ---- Secret scan (G4) -------------------------------------------------------------------------------------

// An API key is "sk-" followed by at least 20 key characters. A letter or digit right before "sk-" means a word that ends in
// "sk-" (task ids, symbol names in binaries), so it is not a key start. The character before is judged after the serialization
// that wrote the evidence is undone, layer by layer: JSON \n \t \r \f \b \uXXXX, util.inspect \xXX and URL %XX. A key behind
// "\n", "%0A", "%5Cn" or "%250A" therefore still counts, while "%61" or the unicode escape of a is the letter a. The search runs
// on the literal "sk-" first, so a 150 MB binary costs a plain substring search. Only the run of escape characters that ends
// right at the candidate is decoded, up to its first character that no escape is made of, so a long nested escape is seen
// whole and an unrelated escape elsewhere on the line cannot use up the layers.
const KEY_MAX_RUN = 1024;
const KEY_MAX_DECODE_LAYERS = 6;
const ESCAPE_CHARACTER_CODES = (() => {
  const table = new Uint8Array(128);
  // Hex digits (which cover the escape letters f and b), the lead-ins % and a backslash, u and x, and the escape letters n t r.
  for (const character of '0123456789abcdefABCDEF%\\uxntr') table[character.charCodeAt(0)] = 1;
  return table;
})();
const SERIALIZED_CHARACTER = /\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([ntrfb]))|%([0-9a-fA-F]{2})/g;
const ESCAPE_LETTERS = Object.freeze({ n: '\n', t: '\t', r: '\r', f: '\f', b: '\b' });
function decodeSerializationOnce(text) {
  return text.replace(SERIALIZED_CHARACTER, (_match, unicode, hex, letter, percent) => {
    if (unicode !== undefined) return String.fromCharCode(parseInt(unicode, 16));
    if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16));
    if (percent !== undefined) return String.fromCharCode(parseInt(percent, 16));
    return ESCAPE_LETTERS[letter];
  });
}
function startsApiKey(text, index) {
  let begin = index;
  while (begin > 0 && index - begin < KEY_MAX_RUN && ESCAPE_CHARACTER_CODES[text.charCodeAt(begin - 1)] === 1) begin -= 1;
  // A run this long is not judged: the scan reports instead of guessing.
  if (index - begin >= KEY_MAX_RUN) return true;
  // The character before the run is no part of an escape; it stays in the context as the end of a run of length zero.
  let context = text.slice(Math.max(0, begin - 1), index);
  for (let layer = 0; layer <= KEY_MAX_DECODE_LAYERS; layer += 1) {
    if (context === '' || !/[A-Za-z0-9]$/.test(context)) return true;
    const decoded = decodeSerializationOnce(context);
    if (decoded === context) return false;
    context = decoded;
  }
  // Nested deeper than any serializer of this suite writes: the scan reports instead of guessing.
  return true;
}
function containsApiKey(text) {
  const candidate = /sk-(?=[A-Za-z0-9_-]{20})/g;
  let found = candidate.exec(text);
  while (found !== null) {
    if (startsApiKey(text, found.index)) return true;
    found = candidate.exec(text);
  }
  return false;
}
const SECRET_PATTERNS = Object.freeze([
  { id: 'api-key-prefix', pattern: { test: containsApiKey } },
  { id: 'bearer-token', pattern: /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{16,}/i },
  { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]);
function scanBytesForSecrets(bytes, extraLiterals) {
  const text = bytes.toString('latin1');
  const hits = [];
  for (const item of SECRET_PATTERNS) if (item.pattern.test(text)) hits.push(item.id);
  for (const literal of extraLiterals || []) if (literal && (bytes.includes(Buffer.from(literal, 'utf8')) || bytes.includes(Buffer.from(literal, 'latin1')))) hits.push('configured-secret-literal');
  return hits;
}
function listFilesRecursive(root, out = []) {
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) listFilesRecursive(absolute, out);
    else if (entry.isFile()) out.push(absolute);
  }
  return out;
}
// The positive control proves the scanner would detect the configured test secret and a generic key; the real scan
// then reports only files that match. Binary media are skipped by extension, text and JSON are always scanned.
function scanRun(runRoot, secretLiteral) {
  const control = fixtures.secretSplitAcrossChunks();
  const controlHits = [
    ...scanBytesForSecrets(Buffer.from(`control ${control.secret}`), [secretLiteral]),
    // Assembled at run time: a whole literal would be flagged by the producer's own payload scan.
    ...scanBytesForSecrets(Buffer.from(['control Authorization:', ' Bearer ', 'abcdefghijklmnop', '0123456789'].join('')), []),
  ];
  const findings = [];
  const credentials = fixtures.secretCredentials();
  const raw = [credentials.api, credentials.header, credentials.oldApi, credentials.password, `${credentials.username}:${credentials.password}`,
    `${credentials.username}new:${credentials.password}`, `${credentials.username}:${credentials.password}-new`, ['FUTURE', 'A939-RECOVERY-VALUE'].join('-')];
  for (const sample of fixtures.SECRET_SAMPLES['B2-A38-03']) raw.push(`${fixtures.secretCredentials(sample.id).username}:${credentials.password}`);
  for (const id of ['B2-A38-04', 'B2-A38-08']) for (const sample of fixtures.SECRET_SAMPLES[id]) raw.push(fixtures.phase2Token(sample));
  const phase2Literals = [...new Set(raw.flatMap((value) => ['utf8', 'latin1'].flatMap((material) => fixtures.SECRET_FORMS.filter((form) => form !== 'path').map((form) => fixtures.secretForm(value, form, material)))))];
  const phase2Controls = phase2Literals.map((value) => ({ sha256: sha256Bytes(Buffer.from(value)), detected: scanBytesForSecrets(Buffer.from(value), [value]).length > 0 }));
  const controlledInputs = [];
  let scanned = 0;
  for (const file of listFilesRecursive(runRoot)) {
    if (/\.(png|ico|pak)$/i.test(file)) continue;
    scanned += 1;
    const bytes = fs.readFileSync(file);
    const relative = path.relative(runRoot, file).split(path.sep).join('/');
    // A37-03 intentionally creates a recovery input before its value is known. Only that exact fixed byte input may be classified here.
    const future = Buffer.from(['FUTURE', 'A939-RECOVERY-VALUE'].join('-'));
    if (relative.startsWith('secrets/a37-03/workspace/.agent_recovery/') && bytes.equals(future)) {
      controlledInputs.push({ file: relative, size: bytes.length, sha256: sha256Bytes(bytes), reason: 'A37-03 baseline input created before secret registration; unsafe restore is refused' });
      continue;
    }
    const hits = scanBytesForSecrets(bytes, [secretLiteral, ...phase2Literals]);
    for (const literal of phase2Literals) if (bytes.includes(Buffer.from(literal, 'utf16le'))) { hits.push('phase2-utf16-secret'); break; }
    if (hits.length) findings.push({ file: path.relative(runRoot, file), hits });
  }
  return { positive_control_detected: controlHits.includes('configured-secret-literal') && controlHits.includes('bearer-token') && controlHits.includes('api-key-prefix'),
    control_hits: controlHits, phase2_positive_controls: phase2Controls, phase2_controls_detected: phase2Controls.every((c) => c.detected),
    controlled_inputs: controlledInputs, files_scanned: scanned, findings };
}

// ---- Evidence manifest --------------------------------------------------------------------------------------

function buildEvidenceManifest(runRoot, excluded) {
  const skip = new Set((excluded || []).map((item) => path.resolve(item)));
  const files = listFilesRecursive(runRoot).filter((file) => !skip.has(path.resolve(file))).sort().map((file) => {
    const bytes = fs.readFileSync(file);
    return { path: path.relative(runRoot, file).replace(/\\/g, '/'), size: bytes.length, sha256: sha256Bytes(bytes) };
  });
  return { schema_version: 1, candidate_label: CONTRACT.candidate, generated_at: new Date().toISOString(), files };
}

// ---- Provider fixture (loopback) -------------------------------------------------------------------------------

function toolParameterNames(parsed) {
  const out = {};
  for (const tool of Array.isArray(parsed && parsed.tools) ? parsed.tools : []) {
    const fn = tool && tool.function;
    if (fn && typeof fn.name === 'string') out[fn.name] = Object.keys((fn.parameters && fn.parameters.properties) || {}).sort();
  }
  return out;
}
// The continue request carries the persisted facts as JSON between two fixed sentences; count its unknown results.
function recoveryUnknownCount(prompt) {
  const found = /\n(\{[\s\S]*\})\n不得重放/.exec(String(prompt || ''));
  if (!found) return null;
  try { const facts = JSON.parse(found[1]); return Array.isArray(facts.unknownResults) ? facts.unknownResults.length : null; } catch (_error) { return null; }
}

const messagesForScan = (parsed) => (parsed.messages || []).filter((m) => m.role === 'system').map((m) => m.content);

class ProviderFixture {
  constructor(logFile) {
    this.logFile = logFile;
    this.state = { shellKind: 'cmd', afterHold: false, holdNext: false };
    this.requestCount = 0;
    this.toolMessageCount = 0;
    this.heldCount = 0;
    this.holdSockets = [];
    this.phase2Bodies = []; this.phase2Stream = null;
    this.server = http.createServer((request, response) => this.handle(request, response));
  }
  listen() { return new Promise((resolve) => this.server.listen(0, '127.0.0.1', () => resolve(this.server.address().port))); }
  close() {
    for (const socket of this.holdSockets) { try { socket.destroy(); } catch (_error) { /* closed */ } }
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
  handle(request, response) {
    if (request.url && request.url.startsWith('/__b2/')) return this.control(request, response);
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (_error) { /* logged as invalid */ }
      const isProbe = parsed && parsed.tools && parsed.tools[0] && parsed.tools[0].function && parsed.tools[0].function.name === 'probe_test_echo';
      if (isProbe) {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe-b2', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] })}\n\n`);
        response.write('data: [DONE]\n\n');
        response.end();
        return;
      }
      if (this.state.phase2Case && (Buffer.byteLength(body) > fixtures.SECRET_BUDGET.provider_body_bytes || this.requestCount >= fixtures.SECRET_BUDGET.provider_requests)) { response.writeHead(429); response.end(); return; }
      this.requestCount += 1;
      if (this.state.phase2Case) {
        const text = JSON.stringify(messagesForScan(parsed));
        const sample = fixtures.phase2Sample(this.state.phase2Case, this.state.phase2Sample);
        const instruction = sample && fixtures.secretExample(sample.example);
        this.phase2Bodies.push({ index: this.requestCount, size: Buffer.byteLength(body), sha256: sha256Bytes(Buffer.from(body)),
          instruction_body_hits: instruction ? (text.includes(instruction) ? 1 : 0) : 0 });
      }
      const messages = (parsed && parsed.messages) || [];
      this.toolMessageCount = messages.filter((item) => item.role === 'tool').length;
      const { prompt } = fixtures.lastUserPrompt(parsed || {});
      const hold = this.state.holdNext === true;
      const step = hold ? { hold: true } : fixtures.providerStep(parsed || {}, this.state);
      if (hold) this.state.holdNext = false;
      fs.appendFileSync(this.logFile, `${JSON.stringify({ index: this.requestCount, at: new Date().toISOString(), tools_offered: Array.isArray(parsed.tools) ? parsed.tools.length : 0,
        tool_params: toolParameterNames(parsed), messages: messages.length, tool_messages: this.toolMessageCount, prompt_head: this.state.phase2Case ? `${this.state.phase2Case}/${this.state.phase2Sample}` : prompt.slice(0, 80),
        prompt_sha256: crypto.createHash('sha256').update(prompt).digest('hex'), recovery_unknown_count: recoveryUnknownCount(prompt),
        agents_marker_present: body.includes('B2-AGENTS-MARKER'), step: step.hold ? 'hold' : step.tool ? `tool:${step.tool.name}` : 'final' })}\n`, 'utf8');
      if (step.hold) {
        this.heldCount += 1;
        this.holdSockets.push(request.socket);
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write(': held\n\n');
        return; // never answered: the process under test is stopped, killed, or the fixture is closed
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (value) => response.write(`data: ${JSON.stringify(value)}\n\n`);
      if (step.phase2Stream) {
        const stream = step.phase2Stream; const first = Date.now();
        this.phase2Stream = { id: stream.id, first_chunk_at: first, second_chunk_at: null, response, tail: stream.tail };
        send({ choices: [{ delta: { content: stream.head }, finish_reason: null }] });
        this.holdSockets.push(request.socket);
        return; // second chunk is released only after the driver reads the real liveModelPreview
      }
      if (step.tool) {
        send({ choices: [{ delta: { content: step.note || '', tool_calls: [{ index: 0, id: step.id, function: { name: step.tool.name, arguments: JSON.stringify(step.tool.args) } }] }, finish_reason: 'tool_calls' }] });
      } else send({ choices: [{ delta: { content: step.content || '' }, finish_reason: 'stop' }] });
      response.write('data: [DONE]\n\n');
      response.end();
    });
  }
  control(request, response) {
    if (request.method === 'GET' && request.url === '/__b2/counters') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ requests: this.requestCount, tool_messages: this.toolMessageCount, held: this.heldCount, state: this.state, phase2_bodies: this.phase2Bodies, phase2_stream: this.phase2Stream ? { id: this.phase2Stream.id, first_chunk_at: this.phase2Stream.first_chunk_at, second_chunk_at: this.phase2Stream.second_chunk_at } : null }));
      return;
    }
    if (request.method === 'POST' && request.url === '/__b2/state') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        try {
          const next = JSON.parse(body);
          if (next.phase2Case !== undefined || next.phase2Sample !== undefined) {
            if (!fixtures.phase2Sample(next.phase2Case, next.phase2Sample)) throw new Error('A9_39_FIXED_SAMPLE_REQUIRED');
            this.state.phase2Case = next.phase2Case; this.state.phase2Sample = next.phase2Sample;
          }
          if (next.phase2Reset === true) { this.state.phase2Case = null; this.state.phase2Sample = null; this.phase2Stream = null; }
          if (next.phase2Release !== undefined) {
            const stream = this.phase2Stream;
            if (!stream || stream.id !== next.phase2Release || stream.second_chunk_at !== null) throw new Error('A9_39_STREAM_RELEASE');
            stream.second_chunk_at = Date.now();
            stream.response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: stream.tail }, finish_reason: 'stop' }] })}\n\n`);
            stream.response.end('data: [DONE]\n\n');
          }
          if (next.shellKind !== undefined) this.state.shellKind = next.shellKind === 'powershell' ? 'powershell' : 'cmd';
          if (next.afterHold !== undefined) this.state.afterHold = next.afterHold === true;
          if (next.holdNext !== undefined) this.state.holdNext = next.holdNext === true;
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ ok: true, state: this.state }));
        } catch (_error) { response.writeHead(400); response.end('{}'); }
      });
      return;
    }
    response.writeHead(404);
    response.end();
  }
}

// ---- Driver plans --------------------------------------------------------------------------------------------------

// Modes are driver process kinds. A mode with killOnMarker is stopped by the smoke (whole tree) once the driver has
// persisted its pre-kill facts and written <mode>.ready; every other mode must exit by itself. chain_exit is the one
// mode whose real exit dialog is answered by the desktop controller through the smoke (dialogButton = index to click).
// release_exit (p05) is the second: it clicks "leave to system" (index 1), so a managed process outlives the product by design.

const PHASE2_MODES = Object.freeze({
  secrets_a37_01: { caseId: 'B2-A37-01', timeoutMs: 900000 },
  secrets_a37_02: { caseId: 'B2-A37-02', timeoutMs: 1800000 },
  secrets_a37_03_prepare: { caseId: 'B2-A37-03', timeoutMs: 300000 },
  secrets_a37_03_restart: { caseId: 'B2-A37-03', timeoutMs: 300000, previous: 'secrets_a37_03_prepare' },
  secrets_a37_04: { caseId: 'B2-A37-04', timeoutMs: 300000 },
  secrets_a38_01: { caseId: 'B2-A38-01', timeoutMs: 1200000 },
  secrets_a38_02: { caseId: 'B2-A38-02', timeoutMs: 600000 },
  secrets_a38_03: { caseId: 'B2-A38-03', timeoutMs: 900000 },
  secrets_a38_04: { caseId: 'B2-A38-04', timeoutMs: 900000 },
  secrets_a38_05: { caseId: 'B2-A38-05', timeoutMs: 1200000 },
  secrets_a38_05_restart: { caseId: 'B2-A38-05', timeoutMs: 300000, previous: 'secrets_a38_05' },
  secrets_a38_06: { caseId: 'B2-A38-06', timeoutMs: 300000 },
  secrets_a38_07_save: { caseId: 'B2-A38-07', timeoutMs: 300000 },
  secrets_a38_07_restart: { caseId: 'B2-A38-07', timeoutMs: 300000, previous: 'secrets_a38_07_save' },
  secrets_a38_08: { caseId: 'B2-A38-08', timeoutMs: 600000 },
});

const DRIVER_MODES = Object.freeze({
  ...PHASE2_MODES,
  chain_a: { timeoutMs: 300000 },
  chain_interrupt: { timeoutMs: 180000, killOnMarker: true },
  chain_recover: { timeoutMs: 300000 },
  chain_exit: { timeoutMs: 300000, dialogButton: 0 },
  stream_live: { timeoutMs: 300000 },
  stream_encodings: { timeoutMs: 360000 },
  stream_limits: { timeoutMs: 420000 },
  audit_stop: { timeoutMs: 240000 },
  session_bg: { timeoutMs: 900000 },
  session_restart: { timeoutMs: 180000 },
  release_exit: { timeoutMs: 300000, dialogButton: 1 },
  continue_interrupt: { timeoutMs: 180000, killOnMarker: true },
  continue_restart: { timeoutMs: 300000 },
  continue_unknown_interrupt: { timeoutMs: 180000, killOnMarker: true },
  continue_unknown: { timeoutMs: 300000 },
  continue_guards: { timeoutMs: 360000 },
  continue_mode_guard: { timeoutMs: 300000, corruptModeSettings: true },
  safe_rules: { timeoutMs: 240000 },
  ui_interrupt: { timeoutMs: 180000, killOnMarker: true },
  ui_continue: { timeoutMs: 300000 },
  ui_layouts: { timeoutMs: 300000 },
});
const DRIVER_PLANS = Object.freeze({
  'p03-chain': ['chain_a', 'chain_interrupt', 'chain_recover', 'chain_exit'],
  'p04-streaming': ['stream_live', 'stream_encodings', 'stream_limits', 'audit_stop'],
  'p05-session-bg': ['session_bg', 'session_restart', 'release_exit'],
  'p06-continue': ['continue_guards', 'continue_interrupt', 'continue_restart', 'continue_unknown_interrupt', 'continue_mode_guard', 'continue_unknown'],
  'p07-safe': ['safe_rules', ...Object.keys(PHASE2_MODES)],
  'p08-ui': ['ui_interrupt', 'ui_continue', 'ui_layouts'],
});

// The product reads the workspace mode settings once, when it opens the workspace at startup. The unresolved-mode guard (B2-CONT-03) can only be
// observed when the file is already unreadable at that moment, so the smoke corrupts it before launching the mode and restores the original bytes afterwards.
// The v2 settings file is the only *.json in workspace-modes that is not a v1 file; anything else is not unique and nothing is touched.
const CORRUPT_MODE_SETTINGS = '{ "schemaVersion": ';
function findModeSettingsFile(dataRoot) {
  const directory = path.join(dataRoot, 'workspace-modes');
  const names = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => /\.json$/.test(name) && !/\.v1\.json$/.test(name)) : [];
  return { count: names.length, file: names.length === 1 ? path.join(directory, names[0]) : null };
}
function corruptModeSettings(dataRoot) {
  const found = findModeSettingsFile(dataRoot);
  const state = { files_found: found.count, corrupted: false, file: found.file, original: null, original_sha256: null, error: null };
  if (!found.file) return state;
  try {
    state.original = fs.readFileSync(found.file);
    state.original_sha256 = sha256Bytes(state.original);
    fs.writeFileSync(found.file, CORRUPT_MODE_SETTINGS, 'utf8');
    state.corrupted = true;
  } catch (error) { state.error = String(error && error.message ? error.message : error).slice(0, 200); }
  return state;
}
function restoreModeSettings(state) {
  if (!state || !state.file || !state.original) return { restored: false, matches_original: false, error: state && state.error ? state.error : null };
  try {
    fs.writeFileSync(state.file, state.original);
    return { restored: true, matches_original: sha256Bytes(fs.readFileSync(state.file)) === state.original_sha256, error: null };
  } catch (error) { return { restored: false, matches_original: false, error: String(error && error.message ? error.message : error).slice(0, 200) }; }
}

// Every driver phase prepares the runtime copy again. Windows refuses to overwrite an executable that a process still has mapped (EBUSY),
// so a target that already holds the same bytes is left alone; any other target is copied and a copy error still stops the phase.
function copyRuntimeFile(from, to) {
  let same = false;
  try {
    const target = fs.statSync(to);
    same = target.isFile() && target.size === fs.statSync(from).size && sha256File(to) === sha256File(from);
  } catch (_error) { same = false; }
  if (!same) fs.copyFileSync(from, to);
}

function prepareDriverRuntime(candidateRoot, runRoot) {
  const runtimeRoot = path.join(runRoot, 'driver-electron');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  for (const entry of fs.readdirSync(candidateRoot, { withFileTypes: true })) {
    if (entry.isFile()) copyRuntimeFile(path.join(candidateRoot, entry.name), path.join(runtimeRoot, entry.name));
  }
  for (const directory of ['locales', 'swiftshader']) {
    const source = path.join(candidateRoot, directory);
    if (fs.existsSync(source)) copyTree(source, path.join(runtimeRoot, directory));
  }
  fs.mkdirSync(path.join(runtimeRoot, 'resources'), { recursive: true });
  copyRuntimeFile(path.join(candidateRoot, 'resources', 'default_app.asar'), path.join(runtimeRoot, 'resources', 'default_app.asar'));
  const appRoot = path.join(runRoot, 'driver-app');
  fs.mkdirSync(appRoot, { recursive: true });
  const driverSource = path.join(candidateRoot, 'validation', 'a9-batch2-driver.cjs');
  fs.copyFileSync(driverSource, path.join(appRoot, 'main.cjs'));
  fs.writeFileSync(path.join(appRoot, 'package.json'), `${JSON.stringify({ name: 'a9-batch2-driver', version: '1.0.0', main: 'main.cjs', private: true }, null, 2)}\n`, 'utf8');
  return { electronPath: path.join(runtimeRoot, 'electron.exe'), appRoot, driverSha256: sha256File(driverSource) };
}
function prepareCleanupWorker(runtime) {
  const cleanupPowerShell = path.join(path.dirname(runtime.electronPath), 'cleanup-tools', 'powershell.exe');
  fs.mkdirSync(path.dirname(cleanupPowerShell), { recursive: true });
  const systemPowerShell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  if (process.platform !== 'win32' || !fs.existsSync(systemPowerShell)) throw new Error('A9_BATCH2_CLEANUP_POWERSHELL_UNAVAILABLE');
  copyRuntimeFile(systemPowerShell, cleanupPowerShell);
  if (sha256File(systemPowerShell) !== sha256File(cleanupPowerShell)) throw new Error('A9_BATCH2_CLEANUP_POWERSHELL_COPY_MISMATCH');
  return cleanupPowerShell;
}
function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to); else if (entry.isFile()) copyRuntimeFile(from, to);
  }
}

// One process by id, never its tree: a process the product released is no longer a child of anything the suite owns, and only an
// instance whose id and creation stamp were checked is passed here (finishReleaseEvidence).
function killProcess(pid, scope) {
  if (!scope || typeof scope.terminate !== 'function') throw new Error('A9_BATCH2_CLEANUP_SCOPE_REQUIRED');
  return scope.terminate(pid, false);
}
function killTree(pid, scope) {
  if (!scope || typeof scope.terminate !== 'function') throw new Error('A9_BATCH2_CLEANUP_SCOPE_REQUIRED');
  return scope.terminate(pid, true);
}

// ADR-0264. These are instance-bound fixture exceptions, never a general system-image allowlist.
const CLEANUP_ROOT = 'c:\\a9-dev\\';
const CLEANUP_SID = 'S-1-5-21-1708701742-428676696-1831205153-1001';
const CLEANUP_EXPIRES = Date.parse('2026-10-28T00:00:00Z');
const FIXTURE_IMAGES = Object.freeze({ cmd: 'C:\\Windows\\System32\\cmd.exe',
  powershell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ping: 'C:\\Windows\\System32\\PING.EXE' });
function cleanupInteger(value) { return (typeof value === 'number' || typeof value === 'string') && /^[1-9][0-9]*$(?![\s\S])/.test(String(value)) && Number.isSafeInteger(Number(value)); }
function cleanupStamp(value) {
  if (typeof value !== 'string' || !/^[0-9]{14}\.[0-9]{6}[+-][0-9]{3}$(?![\s\S])/.test(value)) return false;
  const a = [value.slice(0, 4), value.slice(4, 6), value.slice(6, 8), value.slice(8, 10), value.slice(10, 12), value.slice(12, 14)].map(Number);
  const date = new Date(Date.UTC(a[0], a[1] - 1, a[2], a[3], a[4], a[5]));
  return a[0] >= 1601 && date.getUTCFullYear() === a[0] && date.getUTCMonth() + 1 === a[1] && date.getUTCDate() === a[2]
    && date.getUTCHours() === a[3] && date.getUTCMinutes() === a[4] && date.getUTCSeconds() === a[5];
}
function cleanupIdentity(row) {
  if (!row || !cleanupInteger(row.ProcessId) || !cleanupInteger(row.ParentProcessId) || !cleanupInteger(row.SessionId)
    || !cleanupStamp(row.CreationDate) || row.ImageSource !== 'executable_path' || typeof row.ExecutablePath !== 'string'
    || row.ExecutablePath !== row.ImagePath || !row.ExecutablePath || /[\x00-\x1f|]/.test(row.ExecutablePath)
    || path.win32.normalize(row.ExecutablePath) !== row.ExecutablePath || !/^[A-Za-z]:\\/.test(row.ExecutablePath)
    || /[:*?"<>]/.test(row.ExecutablePath.slice(2)) || row.ExecutablePath.split('\\').some((part) => /[. ]$/.test(part))
    || typeof row.Name !== 'string' || path.win32.basename(row.ExecutablePath).toLowerCase() !== row.Name.toLowerCase()) return null;
  return { pid: Number(row.ProcessId), parent: Number(row.ParentProcessId), session: Number(row.SessionId),
    name: row.Name, image: row.ExecutablePath, created: row.CreationDate };
}
function sameCleanupIdentity(a, b) {
  return Boolean(a && b && a.pid === b.pid && a.parent === b.parent && a.session === b.session && a.name === b.name
    && a.created === b.created && a.image === b.image && a.sid === b.sid);
}
function cleanupEnvironment(item) {
  const image = item.image.toLowerCase();
  return (item.name.toLowerCase() === 'sgtool.exe' && /^c:\\program files \(x86\)\\sogouinput\\[^\x00-\x1f]+\\sgtool\.exe$(?![\s\S])/.test(image))
    || (item.name.toLowerCase() === 'sogouexe.exe' && image === 'c:\\program files (x86)\\sogouinput\\sogouexe\\sogouexe.exe');
}
function cleanupPsString(value) { return `'${String(value).replace(/'/g, "''")}'`; }
// WMI recheck -> Terminate is not atomic. The receipt records that limit; no PID-only fallback is permitted.
function cleanupWmi(pid, expected, spawnSync = childProcess.spawnSync, worker = process.env.A9_BATCH2_CLEANUP_POWERSHELL) {
  if (!cleanupInteger(pid)) throw new Error('A9_BATCH2_CLEANUP_PID_INVALID');
  if (spawnSync === childProcess.spawnSync && (!worker || !/^[A-Za-z]:\\/.test(worker) || path.win32.basename(worker).toLowerCase() !== 'powershell.exe'
    || path.win32.normalize(worker) !== worker || !fs.existsSync(worker) || sha256File(worker) !== sha256File(FIXTURE_IMAGES.powershell))) throw new Error('A9_BATCH2_CLEANUP_WORKER_NOT_BOUND');
  const checks = expected ? Object.entries({ ProcessId: expected.pid, ParentProcessId: expected.parent, SessionId: expected.session,
    Name: expected.name, ExecutablePath: expected.image, CreationDate: expected.created }).map(([key, value]) => `[string]$p.${key} -ceq ${cleanupPsString(value)}`).join(' -and ') : '';
  const script = `$ErrorActionPreference='Stop'\nfunction Facts($p) { $s=$p.GetOwnerSid(); $o=$p.GetOwner(); if ($s.ReturnValue -ne 0 -or $o.ReturnValue -ne 0 -or $o.User -ine 'agent') { throw 'OWNER_UNKNOWN' }; return ([string]$p.ProcessId+'|'+[string]$p.ParentProcessId+'|'+[string]$p.SessionId+'|'+[string]$p.Name+'|'+[string]$p.ExecutablePath+'|'+[string]$p.CreationDate+'|'+[string]$s.Sid) }\n`
    + `$r=@(Get-WmiObject Win32_Process -Filter 'ProcessId=${Number(pid)}'); if ($r.Count -eq 0) { [Console]::WriteLine('GONE'); exit 0 }; if ($r.Count -ne 1) { throw 'AMBIGUOUS' }; $p=$r[0]; $f=Facts $p\n`
    + (expected ? `if (-not (${checks}) -or $f.Split('|')[6] -cne ${cleanupPsString(expected.sid)}) { throw 'IDENTITY_CHANGED' }; $r=@(Get-WmiObject Win32_Process -Filter 'ProcessId=${Number(pid)}'); if ($r.Count -eq 0) { [Console]::WriteLine('GONE'); exit 0 }; if ($r.Count -ne 1) { throw 'AMBIGUOUS' }; $p=$r[0]; if (-not (${checks}) -or (Facts $p) -cne $f) { throw 'IDENTITY_CHANGED' }; $t=$p.Terminate(); if ($t.ReturnValue -ne 0) { throw 'TERMINATE_FAILED' }; [Console]::WriteLine('TERMINATED|'+$f)`
      : "[Console]::WriteLine('FACTS|'+$f)");
  const result = spawnSync(worker, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { windowsHide: true, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS, maxBuffer: 16384 });
  if (result.error || result.status !== 0) throw new Error('A9_BATCH2_CLEANUP_WMI_FAILED');
  const text = String(result.stdout || '').trim();
  if (text === 'GONE') return { status: 'ALREADY_ENDED' };
  const fields = text.split('|');
  if (fields.length !== 8 || !['FACTS', 'TERMINATED'].includes(fields[0])) throw new Error('A9_BATCH2_CLEANUP_WMI_UNKNOWN');
  const item = cleanupIdentity({ ProcessId: fields[1], ParentProcessId: fields[2], SessionId: fields[3], Name: fields[4],
    ExecutablePath: fields[5], ImagePath: fields[5], ImageSource: 'executable_path', CreationDate: fields[6] });
  if (!item || fields[7] !== CLEANUP_SID) throw new Error('A9_BATCH2_CLEANUP_OWNER_MISMATCH');
  return { status: fields[0], identity: { ...item, sid: fields[7] } };
}
function fixtureCommandInvocation(kind, name, candidateRoot) {
  const command = fixtures.shellCommand(kind, { name });
  const build = require(path.join(candidateRoot, 'resources', 'app', 'runner', 'dist', 'trusted-shell-runner.js')).buildTrustedShellInvocation;
  return { command, args: build(kind, FIXTURE_IMAGES[kind], command).args.join(' ') };
}
function matchesFixtureCommand(line, image, args) {
  if (typeof line !== 'string') return false;
  const prefix = line.startsWith('"') ? `"${image}" ` : `${image} `;
  return line.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase() && line.slice(prefix.length) === args;
}
// The driver supplies the actual tool_start and optional handle. Command text is checked only in memory.
function captureFixtureCleanup(input, exec = realExec, owner = cleanupWmi) {
  const spec = input.fixture === 'released-hold' ? { call: 'b2-rel-1', tool: 'start_process' } : input.fixture === 'long-running' ? { call: 'b2-unk-1', tool: 'shell' } : null;
  const invocation = fixtureCommandInvocation(input.kind, input.fixture, input.candidateRoot);
  const event = input.toolEvent;
  if (!spec || !event || event.callId !== spec.call || event.toolName !== spec.tool || !event.args || event.args.command !== invocation.command
    || !input.turnId || !input.runId || !input.phase || !input.mode || !cleanupInteger(input.driverPid)) throw new Error('A9_BATCH2_FIXTURE_CALL_NOT_BOUND');
  const listing = listProcesses(exec); const commands = listCommandLines(exec);
  if (listing.failed || commands.failed) throw new Error('A9_BATCH2_FIXTURE_PROCESS_UNKNOWN');
  const root = listing.rows.find((row) => Number(row.ProcessId) === input.driverPid);
  const driver = cleanupIdentity(root);
  if (!driver) throw new Error('A9_BATCH2_FIXTURE_DRIVER_UNKNOWN');
  const tree = liveDescendants(listing.rows, [driver]);
  const members = new Set(tree.map((item) => item.pid));
  const matches = listing.rows.filter((row) => members.has(Number(row.ProcessId)) && row.ImageSource === 'executable_path'
    && String(row.ExecutablePath).toLowerCase() === FIXTURE_IMAGES[input.kind].toLowerCase()
    && matchesFixtureCommand(commands.byPid.get(String(row.ProcessId)), row.ExecutablePath, invocation.args));
  if (matches.length !== 1 || (input.fixture === 'released-hold' && (!input.handle || matches[0].ProcessId !== String(input.handle.pid) || !input.handle.handleId))) throw new Error('A9_BATCH2_FIXTURE_ROOT_NOT_UNIQUE');
  const selected = [matches[0], ...liveDescendants(listing.rows, [cleanupIdentity(matches[0])]).map((item) => listing.rows.find((row) => Number(row.ProcessId) === item.pid))];
  const instances = selected.map((row, index) => {
    const identity = cleanupIdentity(row);
    if (!identity || identity.session !== input.session || (index > 0 && (identity.image.toLowerCase() !== FIXTURE_IMAGES.ping.toLowerCase()
      || !/^"?(?:c:\\windows\\system32\\)?ping(?:\.exe)?"?\s+-n\s+2\s+127\.0\.0\.1\s*$(?![\s\S])/i.test(commands.byPid.get(String(identity.pid)) || '')))) throw new Error('A9_BATCH2_FIXTURE_DESCENDANT_NOT_BOUND');
    const facts = owner(identity.pid);
    if (index > 0 && facts.status === 'ALREADY_ENDED') return null;
    if (facts.status !== 'FACTS' || !sameCleanupIdentity({ ...identity, sid: CLEANUP_SID }, facts.identity)) throw new Error('A9_BATCH2_FIXTURE_IDENTITY_CHANGED');
    return facts.identity;
  }).filter(Boolean);
  return { schema_version: 1, run_id: input.runId, phase: input.phase, mode: input.mode, driver_pid: input.driverPid,
    fixture: input.fixture, shell_kind: input.kind, command_sha256: sha256Bytes(Buffer.from(invocation.command, 'utf8')),
    call_id: spec.call, tool_name: spec.tool, turn_id: input.turnId, handle: input.handle || null, root_pid: instances[0].pid,
    instances, observed_at: new Date().toISOString() };
}
function createCleanupScope(ctx, runtime, mode, hooks = {}) {
  const exec = hooks.exec || realExec; const owner = hooks.owner || ((pid, expected) => cleanupWmi(pid, expected, childProcess.spawnSync, runtime.cleanupPowerShell));
  const receipt = path.join(ctx.attemptDir, `${mode}-cleanup-events.jsonl`);
  const bindingFile = path.join(ctx.attemptDir, `${mode}-cleanup-binding.json`);
  const tracked = new Map(); let driver = null; let bindingDigest = null; let events = 0;
  const dev = String(ctx.runRoot).toLowerCase().startsWith(CLEANUP_ROOT);
  const imageUnder = (image, root) => image.toLowerCase().startsWith(`${String(root).toLowerCase().replace(/\\+$/, '')}\\`);
  const rootImage = (image) => dev ? image.toLowerCase().startsWith(CLEANUP_ROOT)
    : imageUnder(image, ctx.candidateRoot) || imageUnder(image, path.win32.dirname(runtime.electronPath));
  const invocationFor = hooks.invocation || fixtureCommandInvocation;
  const log = (event) => { if (++events > 64) throw new Error('A9_BATCH2_CLEANUP_EVIDENCE_LIMIT'); fs.appendFileSync(receipt, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8'); };
  const admission = () => {
    if (!ctx.request || !ctx.request.target || ctx.request.target.account_sid !== CLEANUP_SID
      || ctx.request.target.session_id !== 2 || String(ctx.request.target.machine_name).toLowerCase() !== 'dccs-chaizl-pc'
      || String((hooks.hostname || os.hostname)()).toLowerCase() !== 'dccs-chaizl-pc'
      || (dev ? Date.now() >= CLEANUP_EXPIRES || !String(ctx.candidateRoot).toLowerCase().startsWith(CLEANUP_ROOT)
        : String(ctx.request.evidence_root).toLowerCase() !== String(ctx.runRoot).toLowerCase()
          || !ctx.request.bindings || !/^[a-f0-9]{40}$/.test(ctx.request.bindings.source_commit || '')
          || ['continue_unknown_interrupt', 'release_exit'].includes(mode))) throw new Error('A9_BATCH2_CLEANUP_AUTHORITY_MISMATCH');
  };
  const snapshot = () => { const found = listProcesses(exec); if (found.failed || !usableProcessListing(found)) throw new Error('A9_BATCH2_CLEANUP_LISTING_UNKNOWN'); return found.rows; };
  const rememberBinding = () => {
    if (!fs.existsSync(bindingFile)) return;
    const bytes = fs.readFileSync(bindingFile); if (bytes.length > 65536) throw new Error('A9_BATCH2_CLEANUP_BINDING_LIMIT');
    const digest = sha256Bytes(bytes);
    if (bindingDigest) { if (digest !== bindingDigest) throw new Error('A9_BATCH2_CLEANUP_BINDING_CHANGED'); return; }
    const b = JSON.parse(bytes.toString('utf8'));
    const spec = b.fixture === 'released-hold' ? { call: 'b2-rel-1', tool: 'start_process' } : b.fixture === 'long-running' ? { call: 'b2-unk-1', tool: 'shell' } : null;
    const expected = spec && invocationFor(b.shell_kind, b.fixture, ctx.candidateRoot);
    if (!spec || b.schema_version !== 1 || b.run_id !== ctx.runId || b.phase !== ctx.phase || b.mode !== mode || !driver || b.driver_pid !== driver.pid
      || b.call_id !== spec.call || b.tool_name !== spec.tool || !b.turn_id || b.command_sha256 !== sha256Bytes(Buffer.from(expected.command, 'utf8'))
      || !Array.isArray(b.instances) || b.instances.length < 1 || b.instances.length > 32 || !b.instances.some((item) => item.pid === b.root_pid)
      || (b.fixture === 'released-hold' && (!b.handle || b.handle.pid !== b.root_pid || !b.handle.handleId))) throw new Error('A9_BATCH2_CLEANUP_BINDING_MISMATCH');
    const rows = snapshot(); const liveDriver = cleanupIdentity(rows.find((row) => Number(row.ProcessId) === driver.pid));
    const commands = listCommandLines(exec);
    if (!sameCleanupIdentity(driver, liveDriver && { ...liveDriver, sid: CLEANUP_SID }) || commands.failed) throw new Error('A9_BATCH2_CLEANUP_BINDING_NOT_OBSERVED');
    const descendants = liveDescendants(rows, [driver]);
    for (const item of b.instances) {
      if (!cleanupInteger(item.pid) || !cleanupInteger(item.parent) || !cleanupStamp(item.created) || item.sid !== CLEANUP_SID || item.session !== 2
        || !Object.values(FIXTURE_IMAGES).some((image) => image.toLowerCase() === String(item.image).toLowerCase())) throw new Error('A9_BATCH2_CLEANUP_BOUND_IDENTITY_INVALID');
      const live = cleanupIdentity(rows.find((row) => Number(row.ProcessId) === item.pid));
      if (item.pid !== b.root_pid && !live) { tracked.set(`${item.pid}:${item.created}`, item); continue; }
      if (!sameCleanupIdentity(item, live && { ...live, sid: CLEANUP_SID }) || !descendants.some((p) => p.pid === item.pid && p.created === item.created)
        || (item.pid === b.root_pid ? item.image.toLowerCase() !== FIXTURE_IMAGES[b.shell_kind].toLowerCase()
          || !matchesFixtureCommand(commands.byPid.get(String(item.pid)), item.image, expected.args)
          : item.image.toLowerCase() !== FIXTURE_IMAGES.ping.toLowerCase() || !liveDescendants(rows, [b.instances.find((p) => p.pid === b.root_pid)]).some((p) => p.pid === item.pid))) throw new Error('A9_BATCH2_CLEANUP_BOUND_PROCESS_MISMATCH');
      const facts = owner(item.pid);
      if (item.pid !== b.root_pid && facts.status === 'ALREADY_ENDED') { tracked.set(`${item.pid}:${item.created}`, item); continue; }
      if (facts.status !== 'FACTS' || !sameCleanupIdentity(item, facts.identity)) throw new Error('A9_BATCH2_CLEANUP_BOUND_OWNER_MISMATCH');
      tracked.set(`${item.pid}:${item.created}`, item);
    }
    bindingDigest = digest; log({ action: 'BIND_FIXTURE', binding_sha256: digest, call_id: b.call_id, turn_id: b.turn_id, instances: [...tracked.values()] });
  };
  const rememberPings = (rows) => {
    const parents = [...tracked.values()].filter((item) => [FIXTURE_IMAGES.cmd, FIXTURE_IMAGES.powershell].some((image) => item.image.toLowerCase() === image.toLowerCase()));
    if (!parents.length) return;
    for (const parent of parents) {
      const current = rows.find((row) => Number(row.ProcessId) === parent.pid);
      if (current && !sameCleanupIdentity(parent, { ...cleanupIdentity(current), sid: CLEANUP_SID })) throw new Error('A9_BATCH2_CLEANUP_PARENT_IDENTITY_CHANGED');
    }
    const commands = listCommandLines(exec);
    if (commands.failed) throw new Error('A9_BATCH2_CLEANUP_PING_COMMAND_UNKNOWN');
    for (const child of liveDescendants(rows, parents)) {
      const item = cleanupIdentity(rows.find((row) => Number(row.ProcessId) === child.pid));
      if (!item || item.image.toLowerCase() !== FIXTURE_IMAGES.ping.toLowerCase() || item.session !== 2
        || !/^"?(?:c:\\windows\\system32\\)?ping(?:\.exe)?"?\s+-n\s+2\s+127\.0\.0\.1\s*$(?![\s\S])/i.test(commands.byPid.get(String(child.pid)) || '')) throw new Error('A9_BATCH2_CLEANUP_PING_NOT_BOUND');
      const key = `${item.pid}:${item.created}`;
      if (!tracked.has(key)) { const facts = owner(item.pid); if (facts.status === 'ALREADY_ENDED') continue;
        if (facts.status !== 'FACTS' || !sameCleanupIdentity({ ...item, sid: CLEANUP_SID }, facts.identity)) throw new Error('A9_BATCH2_CLEANUP_PING_IDENTITY_CHANGED');
        tracked.set(key, facts.identity); }
    }
  };
  const gone = (identity, rows) => {
    const current = rows.find((row) => Number(row.ProcessId) === identity.pid);
    if (current && !cleanupIdentity(current)) throw new Error('A9_BATCH2_CLEANUP_EXIT_IDENTITY_UNKNOWN');
    return !current || current.CreationDate !== identity.created;
  };
  const terminateOne = (item) => {
    log({ action: 'TERMINATE_INTENT', identity: item });
    const result = owner(item.pid, item);
    if (result.status !== 'TERMINATED' && result.status !== 'ALREADY_ENDED') throw new Error('A9_BATCH2_CLEANUP_TERMINATE_UNKNOWN');
    log({ action: result.status, identity: item });
    if (!gone(item, snapshot())) throw new Error('A9_BATCH2_CLEANUP_EXIT_NOT_OBSERVED');
  };
  const drainCommandChildren = () => {
    let clean = 0;
    for (let round = 0; round < 8 && clean < 2; round++) {
      const rows = snapshot(); rememberPings(rows);
      const roots = [...tracked.values()].filter((item) => item.image.toLowerCase() !== FIXTURE_IMAGES.ping.toLowerCase());
      if (roots.some((item) => !gone(item, rows))) throw new Error('A9_BATCH2_CLEANUP_COMMAND_STILL_ACTIVE');
      const children = [...tracked.values()].filter((item) => item.image.toLowerCase() === FIXTURE_IMAGES.ping.toLowerCase() && !gone(item, rows));
      log({ action: 'COMMAND_DESCENDANTS_AFTER_EXIT', round, children });
      if (children.length) { clean = 0; for (const item of children) terminateOne(item); } else clean++;
    }
    if (clean < 2) throw new Error('A9_BATCH2_CLEANUP_DESCENDANTS_NOT_QUIESCENT');
  };
  return {
    admit() {
      admission(); const facts = owner(process.pid); const groups = exec('whoami_groups');
      if (facts.status !== 'FACTS' || facts.identity.session !== 2 || facts.identity.sid !== CLEANUP_SID
        || !rootImage(facts.identity.image) || groups.status !== 0 || groups.error || parseIntegrity(groups.stdout) !== 'Medium') throw new Error('A9_BATCH2_CLEANUP_RUNTIME_IDENTITY_UNKNOWN');
      log({ action: 'RUNTIME_ADMISSION', node: process.versions.node, identity: facts.identity, integrity: 'Medium' });
    },
    observeBinding() { admission(); rememberBinding(); },
    bind(pid) {
      admission(); const rows = snapshot(); const item = cleanupIdentity(rows.find((row) => Number(row.ProcessId) === pid));
      const facts = item && owner(pid);
      if (!item || item.image.toLowerCase() !== String(runtime.electronPath).toLowerCase() || !facts || facts.status !== 'FACTS'
        || !sameCleanupIdentity({ ...item, sid: CLEANUP_SID }, facts.identity)) throw new Error('A9_BATCH2_CLEANUP_DRIVER_NOT_BOUND');
      driver = facts.identity; log({ action: 'BIND_DRIVER', identity: driver });
    },
    terminate(pid, tree) {
      admission(); if (!driver || !cleanupInteger(pid)) throw new Error('A9_BATCH2_CLEANUP_DRIVER_NOT_BOUND');
      rememberBinding(); const rows = snapshot(); rememberPings(rows);
      const row = rows.find((item) => Number(item.ProcessId) === pid);
      if (!row) { log({ action: 'ALREADY_ENDED', pid }); return; }
      const root = cleanupIdentity(row);
      if (!root) throw new Error('A9_BATCH2_CLEANUP_TARGET_UNKNOWN');
      const connected = new Set([driver.pid, ...liveDescendants(rows, [driver]).map((item) => item.pid)]);
      const selected = tree ? [root, ...liveDescendants(rows, [root]).map((item) => cleanupIdentity(rows.find((r) => Number(r.ProcessId) === item.pid)))] : [root];
      if (selected.some((item) => !item)) throw new Error('A9_BATCH2_CLEANUP_DESCENDANT_UNKNOWN');
      const allowed = []; const environment = [];
      for (const item of selected) {
        if (cleanupEnvironment(item)) { environment.push(item); continue; }
        const bound = tracked.get(`${item.pid}:${item.created}`);
        const inside = rootImage(item.image) && (connected.has(item.pid)
          || (item.image.toLowerCase().startsWith(`${path.win32.dirname(runtime.electronPath).toLowerCase()}\\`) && item.created >= driver.created));
        if (item.session !== 2 || (!inside && (!dev || !bound || !sameCleanupIdentity(bound, { ...item, sid: CLEANUP_SID })))) throw new Error('A9_BATCH2_CLEANUP_TARGET_NOT_AUTHORIZED');
        const facts = owner(item.pid);
        if (facts.status === 'ALREADY_ENDED') continue;
        if (facts.status !== 'FACTS' || !sameCleanupIdentity({ ...item, sid: CLEANUP_SID }, facts.identity)) throw new Error('A9_BATCH2_CLEANUP_IDENTITY_CHANGED');
        allowed.push(facts.identity);
      }
      // The native helper owns KILL_ON_JOB_CLOSE. Refuse it if an unapproved descendant could be reclaimed indirectly.
      for (const item of allowed.filter((p) => p.name.toLowerCase() === 'spike02_helper.exe')) {
        const descendants = liveDescendants(rows, [item]);
        if (descendants.some((child) => !allowed.some((target) => target.pid === child.pid && target.created === child.created)
          && !tracked.has(`${child.pid}:${child.created}`))) throw new Error('A9_BATCH2_CLEANUP_JOB_SCOPE_UNKNOWN');
      }
      log({ action: 'AUTHORIZED_TARGETS', targets: allowed, environment, non_atomic_recheck: true });
      // Stop command roots first. Once observed gone they cannot create another PING; retain historical parent identity for orphan discovery.
      const commandRoots = allowed.filter((item) => tracked.has(`${item.pid}:${item.created}`) && item.image.toLowerCase() !== FIXTURE_IMAGES.ping.toLowerCase());
      for (const item of commandRoots) terminateOne(item);
      if (commandRoots.length) drainCommandChildren();
      const remaining = allowed.filter((item) => !tracked.has(`${item.pid}:${item.created}`) || !commandRoots.length);
      while (remaining.length) {
        const at = remaining.findIndex((item) => !remaining.some((child) => child.parent === item.pid && child.pid !== item.pid));
        if (at < 0) throw new Error('A9_BATCH2_CLEANUP_PARENT_CYCLE');
        const item = remaining.splice(at, 1)[0];
        if (item.name.toLowerCase() === 'spike02_helper.exe') {
          const current = snapshot(); rememberPings(current);
          if ([...tracked.values()].some((target) => !gone(target, current)) || liveDescendants(current, [item]).length) throw new Error('A9_BATCH2_CLEANUP_JOB_NOT_EMPTY');
          log({ action: 'HELPER_JOB_COMMANDS_GONE', identity: item });
        }
        terminateOne(item);
      }
    },
  };
}

// taskkill /T lists the children of a process once. When the main process dies, Chromium can restart a helper (the network service) in
// that instant; the new helper is not on the list, loses its parent and keeps the driver runtime copy mapped. A driver the harness
// killed itself (marker or timeout) is therefore followed by a sweep of the processes that run from the driver runtime copy, and each
// kill attempt and each confirmed removal is recorded. Only that copy is swept: the candidate's own files, the product's children and
// any other path are never touched.
const STRAY_SWEEP_ROUNDS = 8;
const STRAY_SWEEP_CLEAN_ROUNDS = 2;
const STRAY_SWEEP_WAIT_MS = 500;
const PROCESS_LISTING_COLUMNS = ['ProcessId', 'ParentProcessId', 'Name', 'ExecutablePath'];
// A process table can read as intact and still show nothing: no rows, a column missing, a row without a process id. The sweep selects by
// ImagePath (the ExecutablePath, or the command line when that is empty), so it also needs the four columns on every row and one live
// process. Such a table proves nothing about absence.
function usableProcessListing(listing) {
  if (listing.failed) return false;
  const shaped = listing.rows.every((row) => PROCESS_LISTING_COLUMNS.every((column) => Object.prototype.hasOwnProperty.call(row, column))
    && DIGITS.test(String(row.ProcessId).trim()) && DIGITS.test(String(row.ParentProcessId).trim()) && String(row.Name).trim() !== '');
  return shaped && listing.rows.some((row) => Number(row.ProcessId) > 0);
}
function findDriverStrays(exec, runtimeRoot) {
  const listing = listProcesses(exec);
  const prefix = `${path.resolve(runtimeRoot).toLowerCase().replace(/[\\/]+$/, '')}${path.sep}`;
  const strays = listing.rows
    .filter((row) => Number(row.ProcessId) !== process.pid && String(row.ImagePath || '').toLowerCase().startsWith(prefix))
    .map((row) => ({ pid: Number(row.ProcessId), parent_pid: Number(row.ParentProcessId), name: String(row.Name || ''), image_source: row.ImageSource }));
  return { strays, failed: !usableProcessListing(listing) };
}
async function sweepDriverStrays(exec, runtimeRoot, hooks) {
  const kill = (hooks && hooks.kill) || killTree;
  const wait = (hooks && hooks.wait) || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempted = [];
  let clean = 0;
  let lastStrays = [];
  let lastUsable = null;
  for (let round = 0; round < STRAY_SWEEP_ROUNDS && clean < STRAY_SWEEP_CLEAN_ROUNDS; round += 1) {
    await wait(STRAY_SWEEP_WAIT_MS);
    const found = findDriverStrays(exec, runtimeRoot);
    lastStrays = found.strays;
    lastUsable = found.failed ? null : new Set(found.strays.map((item) => item.pid));
    if (found.strays.length) {
      clean = 0;
      for (const stray of found.strays) {
        kill(stray.pid);
        if (!attempted.some((item) => item.pid === stray.pid)) attempted.push(stray);
      }
    // A listing that failed or showed nothing usable shows presence at most, never absence: it is not a clean round and restarts the count.
    } else if (found.failed) clean = 0;
    else clean += 1;
  }
  const observed = clean >= STRAY_SWEEP_CLEAN_ROUNDS;
  // A kill is only an attempt. A process counts as removed when the latest usable listing no longer shows it.
  const removed = attempted.filter((item) => lastUsable !== null && !lastUsable.has(item.pid));
  return { attempted, removed, remaining: observed ? [] : lastStrays, observed };
}

// Asks the desktop controller to click one button of the product's own exit dialog (fixed argv; the index is the only value).
const CLICK_OUTPUT_LIMIT = 8000;
function clickExitDialog(controllerScript, pid, buttonIndex, spawnSync = childProcess.spawnSync) {
  if (!Number.isInteger(pid) || pid < 1 || !Number.isInteger(buttonIndex) || buttonIndex < 0 || buttonIndex > 2) throw new Error('A9_BATCH2_DIALOG_CLICK_ARGUMENT_INVALID');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', controllerScript,
    '-Action', 'ClickDialog', '-ProcessId', String(pid), '-ButtonIndex', String(buttonIndex)], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
  // A miss prints the windows and controls the product process showed (controller ClickDialog, about 7000 characters at most).
  return { status: result.status, stdout: String(result.stdout || '').slice(0, CLICK_OUTPUT_LIMIT), stderr: String(result.stderr || '').slice(0, CLICK_OUTPUT_LIMIT) };
}

// Launches one driver process; resolves with the observed exit. spawn and the click helper are injectable for the unit tests.
function launchDriver(runtime, env, options, spawn = childProcess.spawn) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, ...env };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    delete childEnv.NODE_OPTIONS;
    const started = Date.now();
    const child = spawn(runtime.electronPath, [runtime.appRoot], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let killedBy = null;
    let dialogClick = null;
    let finished = false;
    let cleanupError = null;
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-262144); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-262144); });
    const terminate = (reason) => {
      killedBy = reason;
      try { killTree(child.pid, options.cleanupScope); }
      catch (error) {
        cleanupError = String(error && error.message || error).slice(0, 300);
        // A refused cleanup is unknown lifecycle. Return a failure without waiting forever or terminating an unapproved process.
        if (typeof child.unref === 'function') child.unref();
        for (const stream of [child.stdout, child.stderr]) if (typeof stream.unref === 'function') stream.unref();
        complete(null, null);
      }
    };
    const timer = setTimeout(() => { if (!finished) terminate('timeout'); }, options.timeoutMs);
    const poll = setInterval(() => {
      if (finished) return;
      if (options.killMarker && !killedBy && fs.existsSync(options.killMarker)) terminate('marker');
      if (finished) return;
      if (options.dialogMarker && !dialogClick && fs.existsSync(options.dialogMarker)) {
        try {
          if (options.cleanupScope) options.cleanupScope.observeBinding();
          dialogClick = { at: new Date().toISOString(), ...(options.clickDialog ? options.clickDialog(child.pid) : { status: null, stdout: '', stderr: 'no click helper' }) };
        } catch (error) { cleanupError = String(error && error.message || error).slice(0, 300); complete(null, null); }
      }
    }, 200);
    const complete = (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearInterval(poll);
      if (cleanupError) { if (typeof child.unref === 'function') child.unref(); for (const stream of [child.stdout, child.stderr]) if (typeof stream.unref === 'function') stream.unref(); }
      resolve({ code: code === null ? null : code, signal: signal || null, killed_by: killedBy, duration_ms: Date.now() - started, started_at: new Date(started).toISOString(),
        ended_at: new Date().toISOString(), stdout, stderr, pid: child.pid, dialog_click: dialogClick, ...(cleanupError ? { cleanup_error: cleanupError } : {}) });
    };
    child.on('close', complete);
    child.on('exit', (code, signal) => {
      if (env.A9_BATCH2_MODE !== 'release_exit') return;
      // A released descendant may retain inherited pipe handles after this
      // exact driver has exited. Do not wait for its EOF or kill the old PID.
      // Keep the pipes open; release evidence still checks and removes the
      // bound command by creation identity, independently of this exit.
      for (const stream of [child.stdout, child.stderr]) if (typeof stream.unref === 'function') stream.unref();
      complete(code, signal);
    });
    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearInterval(poll);
      resolve({ code: null, signal: null, killed_by: killedBy, duration_ms: Date.now() - started, stdout, stderr, pid: child.pid, dialog_click: dialogClick,
        spawn_error: String(error && error.message ? error.message : error).slice(0, 300) });
    });
    if (options.cleanupScope) {
      try { options.cleanupScope.bind(child.pid); }
      catch (error) { cleanupError = String(error && error.message || error).slice(0, 300); if (typeof child.unref === 'function') child.unref();
        for (const stream of [child.stdout, child.stderr]) if (typeof stream.unref === 'function') stream.unref(); complete(null, null); }
    }
  });
}

// ---- Context and phase result --------------------------------------------------------------------------------------

function createContext(argv, environment) {
  const env = environment || {};
  const candidateRoot = path.resolve(argument(argv, 'candidate-root', path.join(__dirname, '..')));
  const attemptDir = path.resolve(argument(argv, 'evidence-root'));
  const runRoot = path.resolve(argument(argv, 'run-root'));
  const requestFile = path.join(attemptDir, 'request.json');
  if (!fs.existsSync(requestFile)) throw new Error('A9_BATCH2_REQUEST_FILE_MISSING');
  const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
  const problems = requests.structuralProblems(request);
  const phase = argument(argv, 'phase');
  const runId = argument(argv, 'run-id');
  if (problems.length) throw new Error(`A9_BATCH2_REQUEST_INVALID:${problems.join(',')}`);
  if (request.phase !== phase || request.run_id !== runId) throw new Error('A9_BATCH2_REQUEST_ARGUMENT_MISMATCH');
  if (path.resolve(request.candidate_root) !== candidateRoot) throw new Error('A9_BATCH2_REQUEST_CANDIDATE_ROOT_MISMATCH');
  const manifestSha256 = sha256File(path.join(candidateRoot, 'release-manifest.json'));
  const kitSha256 = sha256File(path.join(candidateRoot, 'A9_BATCH2_VALIDATION_KIT.json'));
  if (manifestSha256 !== request.bindings.manifest_sha256 || kitSha256 !== request.bindings.kit_sha256) throw new Error('A9_BATCH2_REQUEST_BINDING_MISMATCH');
  const bindings = { source_commit: request.bindings.source_commit, package_sha256: request.bindings.package_sha256, manifest_sha256: manifestSha256, kit_sha256: kitSha256 };
  const result = fixtures.newPhaseResult(phase, runId, request.request_index, bindings);
  return { argv, env, candidateRoot, attemptDir, runRoot, request, phase, runId, bindings, result, pid: env.pid || process.pid };
}

function writeEvidence(ctx, name, value) {
  if (!fixtures.evidenceForPhase(ctx.phase).includes(name)) throw new Error(`A9_BATCH2_EVIDENCE_NOT_IN_CONTRACT:${ctx.phase}:${name}`);
  fs.mkdirSync(ctx.attemptDir, { recursive: true });
  const target = path.join(ctx.attemptDir, name);
  if (Buffer.isBuffer(value)) fs.writeFileSync(target, value); else fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function finishPhase(ctx, failureClass) {
  ctx.result.evidence = fixtures.evidenceForPhase(ctx.phase).filter((name) => fs.existsSync(path.join(ctx.attemptDir, name))).map((name) => {
    const bytes = fs.readFileSync(path.join(ctx.attemptDir, name));
    return { file: name, size: bytes.length, sha256: sha256Bytes(bytes) };
  });
  fixtures.finalizePhaseResult(ctx.result, failureClass);
  const problems = fixtures.phaseResultProblems(ctx.result, { runId: ctx.runId, phase: ctx.phase, bindings: ctx.bindings });
  if (ctx.result.status === 'PASS' && problems.length) {
    ctx.result.status = 'FAIL';
    ctx.result.failure_class = 'RESULT_CONTRACT_PROBLEMS';
    ctx.result.first_failure = { case_id: null, assertion_id: null, detail: problems.slice(0, 5).join('|') };
  }
  writeJson(path.join(ctx.attemptDir, 'phase-result.json'), ctx.result);
  return ctx.result;
}

function applyAssertions(ctx, list) {
  for (const item of list) {
    try { fixtures.setAssertion(ctx.result, item.case_id, item.assertion_id, item.status, item.observed); }
    catch (error) { ctx.contractError = String(error && error.message ? error.message : error); }
  }
}

// ---- Phases ----------------------------------------------------------------------------------------------------------------

function freeBytesFor(directory, exec) {
  if (process.platform !== 'win32') return null;
  const drive = path.parse(path.resolve(directory)).root.replace(/\\$/, '').replace(/[^A-Za-z:]/g, '');
  if (!/^[A-Za-z]:$/.test(drive)) return null;
  const spec = { dynamic: { file: 'wmic.exe', args: ['logicaldisk', 'where', `DeviceID='${drive}'`, 'get', 'FreeSpace', '/format:csv'] } };
  const row = parseWmicCsv(exec('free_space', spec).stdout)[0];
  const value = row ? Number(row.FreeSpace) : NaN;
  return Number.isFinite(value) ? value : null;
}

function runEnvironmentPhase(ctx, exec = realExec) {
  let controllerIdentity = null;
  const identityFile = path.join(ctx.attemptDir, 'controller-identity.json');
  if (fs.existsSync(identityFile)) { try { controllerIdentity = JSON.parse(fs.readFileSync(identityFile, 'utf8')); } catch (_error) { controllerIdentity = null; } }
  const facts = collectEnvironment(exec, { pid: ctx.pid, controllerIdentity,
    watchedRoots: [ctx.candidateRoot, path.join(ctx.runRoot, 'driver-electron')], freeBytes: freeBytesFor(ctx.request.evidence_root, exec) });
  writeEvidence(ctx, 'g0-env.json', { schema_version: 1, recorded_at: new Date().toISOString(), node: facts.node, ver: facts.ver, chcp: facts.chcp, wmic_os: facts.wmic_os,
    powershell_version: facts.powershell_version, powershell_codepages: facts.powershell_codepages, hotfixes: facts.hotfixes, free_bytes: facts.free_bytes });
  writeEvidence(ctx, 'g0-identity.json', { schema_version: 1, whoami_user: facts.whoami_user, whoami_groups_integrity: parseIntegrity(facts.whoami_groups),
    session_id: facts.session_id, controller_identity: facts.controller_identity, approved_target: ctx.request.target });
  writeEvidence(ctx, 'g0-processes-before.json', { schema_version: 1, total: facts.processes_total, stale_processes: facts.stale_processes });
  applyAssertions(ctx, evaluateEnvironment(facts, ctx.request, ctx.candidateRoot));
  return finishPhase(ctx, ctx.result.cases.some((item) => item.status === 'UNKNOWN') ? 'ENV_UNKNOWN' : null);
}

// p03 only: the chain's identity re-check (CH-01 A02) and the exit-tree/evidence facts the driver cannot see about itself.
function chainIdentityAssertion(ctx, exec) {
  let controllerIdentity = null;
  const identityFile = path.join(ctx.attemptDir, 'controller-identity.json');
  if (fs.existsSync(identityFile)) { try { controllerIdentity = JSON.parse(fs.readFileSync(identityFile, 'utf8')); } catch (_error) { controllerIdentity = null; } }
  const facts = collectEnvironment(exec, { pid: ctx.pid, controllerIdentity, watchedRoots: [ctx.candidateRoot, path.join(ctx.runRoot, 'driver-electron')], freeBytes: null });
  const verdict = evaluateEnvironment({ ...facts, free_bytes: MIN_FREE_BYTES }, ctx.request, ctx.candidateRoot);
  const identity = verdict.find((item) => item.assertion_id === 'B2-G0-ENV-A02');
  const stale = verdict.find((item) => item.assertion_id === 'B2-G0-ENV-A01');
  const ok = identity && identity.status === 'PASS' && stale && stale.status === 'PASS';
  return { case_id: 'B2-CH-01-START', assertion_id: 'B2-CH-01-START-A02', status: ok ? 'PASS' : identity && identity.status === 'UNKNOWN' ? 'UNKNOWN' : 'FAIL',
    observed: `identity=${identity && identity.status}: ${identity && identity.observed}; old_tree=${stale && stale.status}: ${stale && String(stale.observed).slice(0, 300)}` };
}

// Current process instances, including the driver root, must be observed gone before an A9-39 restart.
async function phase2PostExit(prequit, expectedSid, exec, wait = sleep) {
  if (!prequit || prequit.sid !== expectedSid || prequit.wmic_failures !== 0 || !Array.isArray(prequit.tree) || !prequit.tree.length
    || prequit.tree.some((p) => !Number.isSafeInteger(p.pid) || p.pid <= 0 || !/^\d{14}\.\d{6}[+-]\d{3}$/.test(p.created || ''))) return { observed: false, reason: 'PREQUIT_UNKNOWN', samples: [] };
  const samples = [];
  for (let round = 0; round < 10; round++) {
    const listing = listProcesses(exec);
    const alive = aliveByIdentity(prequit.tree, listing.rows);
    samples.push({ at: new Date().toISOString(), failed: listing.failed, alive });
    if (listing.failed) return { observed: false, reason: 'POSTQUIT_UNKNOWN', samples };
    if (!alive.length) return { observed: true, reason: null, samples };
    await wait(500);
  }
  return { observed: false, reason: 'PROCESS_RESIDUE', samples };
}

async function runDriverPhase(ctx, hooks) {
  const plan = DRIVER_PLANS[ctx.phase];
  if (!plan) throw new Error(`A9_BATCH2_PHASE_NOT_A_DRIVER_PHASE:${ctx.phase}`);
  const launch = (hooks && hooks.launchDriver) || launchDriver;
  const exec = (hooks && hooks.exec) || realExec;
  fs.mkdirSync(ctx.attemptDir, { recursive: true });
  let runtime;
  try { runtime = (hooks && hooks.runtime) || prepareDriverRuntime(ctx.candidateRoot, ctx.runRoot);
    if (!(hooks && hooks.launchDriver)) runtime.cleanupPowerShell = prepareCleanupWorker(runtime); }
  catch (error) {
    // A runtime copy that cannot be prepared is a named phase failure with its error, not a controller crash without a phase result.
    writeJson(path.join(ctx.attemptDir, 'driver-launches.json'), { schema_version: 1, driver_sha256: null, launches: [],
      runtime_prepare_error: String(error && error.message ? error.message : error).slice(0, 400) });
    return finishPhase(ctx, 'DRIVER_RUNTIME_PREPARE_FAILED');
  }
  const providerLog = path.join(ctx.attemptDir, 'provider-requests.jsonl');
  fs.writeFileSync(providerLog, '', 'utf8');
  const fixture = new ProviderFixture(providerLog);
  const port = await fixture.listen();
  const dataRoot = path.join(ctx.runRoot, 'data', ctx.phase);
  const workspaceRoot = path.join(ctx.runRoot, 'workspace', ctx.phase);
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'calc.ts'), 'export function add(a: number, b: number) { return a - b; }\n', 'utf8');
  const controllerScript = path.join(ctx.candidateRoot, 'validation', 'a9-batch2-desktop-controller.ps1');
  const launches = [];
  const cleanupScopes = new Map();
  const productLog = [];
  let identityAssertion = null;
  try {
    if (ctx.phase === 'p03-chain') identityAssertion = chainIdentityAssertion(ctx, exec);
    for (const mode of plan) {
      const spec = DRIVER_MODES[mode];
      fixture.state.phase2Case = null; fixture.state.phase2Sample = null; fixture.phase2Stream = null;
      const isolatedRoot = spec.caseId ? path.join(ctx.runRoot, 'secrets', spec.caseId.slice(3).toLowerCase()) : null;
      const selectedData = isolatedRoot ? path.join(isolatedRoot, 'data') : dataRoot;
      const selectedWorkspace = isolatedRoot ? path.join(isolatedRoot, 'workspace') : workspaceRoot;
      if (isolatedRoot) { fs.mkdirSync(selectedData, { recursive: true }); fs.mkdirSync(selectedWorkspace, { recursive: true }); }
      let previous = null;
      if (spec.previous) {
        previous = launches.find((l) => l.mode === spec.previous);
        if (!previous || previous.code !== 0 || previous.killed_by || previous.tree_absent !== true) throw new Error('A9_39_PREVIOUS_EXIT_UNKNOWN');
      }
      fixture.state.afterHold = false;
      fixture.state.holdNext = false;
      const driverResultFile = path.join(ctx.attemptDir, `driver-${mode}.json`);
      const killMarker = spec.killOnMarker ? path.join(ctx.attemptDir, `${mode}.ready`) : null;
      const dialogMarker = spec.dialogButton !== undefined ? path.join(ctx.attemptDir, 'dialog-shown.marker') : null;
      // A marker left by an earlier mode of the phase would be answered at once, before this mode's own dialog exists.
      if (dialogMarker) fs.rmSync(dialogMarker, { force: true });
      const env = {
        A9_BATCH2_PHASE: ctx.phase, A9_BATCH2_MODE: mode, A9_BATCH2_RUN_ID: ctx.runId, A9_BATCH2_ATTEMPT_DIR: ctx.attemptDir,
        A9_BATCH2_DRIVER_RESULT: driverResultFile, A9_BATCH2_WORKSPACE: selectedWorkspace, A9_BATCH2_DATAROOT: selectedData,
        A9_BATCH2_FIXTURE_URL: `http://127.0.0.1:${port}/v1`, A9_BATCH2_FIXTURE_CONTROL: `http://127.0.0.1:${port}/__b2`, A9_BATCH2_PROVIDER_LOG: providerLog,
        A9_BATCH2_PRODUCT_MAIN: path.join(ctx.candidateRoot, 'resources', 'app', 'product', 'main.js'),
        A9_BATCH2_CANDIDATE_ROOT: ctx.candidateRoot, A9_BATCH2_SECRET_LITERAL: fixtures.testOnlySecret(),
        A9_BATCH2_TARGET: JSON.stringify(ctx.request.target),
        A9_BATCH2_CLEANUP_POWERSHELL: runtime.cleanupPowerShell,
        WIN7AGENT_A9_DATAROOT: selectedData,
        ...(isolatedRoot ? { LOCALAPPDATA: path.join(isolatedRoot, 'profile'), WIN7AGENT_PORTABLE: '0',
          A9_BATCH2_FIXTURES: path.join(ctx.candidateRoot, 'validation', 'a9-batch2-fixtures.cjs'),
          A9_BATCH2_PHASE2_CASE: spec.caseId, A9_BATCH2_BINDINGS: JSON.stringify(ctx.request.bindings), A9_BATCH2_TARGET: JSON.stringify(ctx.request.target),
          A9_BATCH2_NEUTRAL_WORKSPACE: path.join(isolatedRoot, 'neutral'),
          A9_BATCH2_PREVIOUS_EXIT: previous ? JSON.stringify(previous) : '' } : {}),
        WIN7AGENT_A9_ELECTRON_SQLITE: path.join(ctx.candidateRoot, 'resources', 'native', 'storage'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      };
      const modeSettings = spec.corruptModeSettings ? corruptModeSettings(dataRoot) : null;
      if (modeSettings) env.A9_BATCH2_MODE_SETTINGS_CORRUPTED = modeSettings.corrupted ? '1' : '0';
      let exit;
      const cleanupScope = hooks && hooks.launchDriver ? null : createCleanupScope(ctx, runtime, mode);
      let admissionError = null;
      if (cleanupScope && cleanupScopes.size === 0) { try { cleanupScope.admit(); } catch (error) { admissionError = String(error && error.message || error).slice(0, 300); } }
      if (cleanupScope) cleanupScopes.set(mode, cleanupScope);
      try {
        exit = admissionError ? { code: null, signal: null, killed_by: null, duration_ms: 0, pid: null, stdout: '', stderr: '', cleanup_error: admissionError } : await launch(runtime, env, { timeoutMs: spec.timeoutMs, killMarker, dialogMarker, cleanupScope,
          clickDialog: (pid) => (hooks && hooks.clickDialog ? hooks.clickDialog(pid, spec.dialogButton) : clickExitDialog(controllerScript, pid, spec.dialogButton)) });
      } finally {
        // The next mode must start from the original settings whatever happened to this one.
        if (modeSettings) modeSettings.restore = restoreModeSettings(modeSettings);
      }
      const prequitPath = path.join(ctx.attemptDir, `${mode}-prequit.json`);
      let prequit = null;
      if (spec.caseId && fs.existsSync(prequitPath)) prequit = JSON.parse(fs.readFileSync(prequitPath, 'utf8'));
      const postExit = spec.caseId ? await phase2PostExit(prequit, ctx.request.target.account_sid, exec, hooks && hooks.wait) : null;
      const treeAbsent = postExit && postExit.observed === true;
      const strays = exit.killed_by && !exit.cleanup_error ? await sweepDriverStrays(exec, path.join(ctx.runRoot, 'driver-electron'),
        (hooks && hooks.strays) || { kill: (pid) => killProcess(pid, cleanupScope) }) : null;
      launches.push({ mode, code: exit.code, signal: exit.signal, killed_by: exit.killed_by, duration_ms: exit.duration_ms, started_at: exit.started_at, ended_at: exit.ended_at,
        ...(spec.caseId ? { tree_absent: treeAbsent, post_exit: postExit, sid: prequit && prequit.sid } : {}),
        spawn_error: exit.spawn_error || null, pid: exit.pid, dialog_click: exit.dialog_click || null,
        ...(exit.cleanup_error ? { cleanup_error: exit.cleanup_error, failed: true } : {}),
        ...(strays ? { strays } : {}),
        ...(modeSettings ? { mode_settings: { files_found: modeSettings.files_found, corrupted: modeSettings.corrupted, original_sha256: modeSettings.original_sha256, error: modeSettings.error, restore: modeSettings.restore } } : {}) });
      productLog.push(`==== ${mode} (exit=${exit.code}; killed_by=${exit.killed_by}) ====\n${exit.stdout}\n${exit.stderr}\n`);
      if (exit.cleanup_error) break;
      let driverResult = null;
      if (fs.existsSync(driverResultFile)) { try { driverResult = JSON.parse(fs.readFileSync(driverResultFile, 'utf8')); } catch (_error) { driverResult = null; } }
      if (driverResult && Array.isArray(driverResult.assertions)) applyAssertions(ctx, driverResult.assertions);
      if (driverResult && driverResult.status === 'ERROR') { launches[launches.length - 1].failed = true; launches[launches.length - 1].driver_error = String(driverResult.error || '').slice(0, 400); break; }
      if (spec.caseId && !treeAbsent) { launches[launches.length - 1].failed = true; launches[launches.length - 1].driver_error = 'A9_39_PROCESS_TREE_UNKNOWN'; break; }
      if (spec.caseId && driverResult && driverResult.assertions.some((a) => a.status !== 'PASS')) { launches[launches.length - 1].failed = true; break; }
      // A driver that was not supposed to die, or exited non-zero without a result, makes its mode a failure.
      if (!spec.killOnMarker && (exit.code !== 0 || !driverResult)) { launches[launches.length - 1].failed = true; break; }
      if (spec.killOnMarker && exit.killed_by !== 'marker') { launches[launches.length - 1].failed = true; break; }
      // A sweep that is not observed clean (a process still runs from the driver runtime copy, or the listing failed) ends the phase here.
      if (strays && !strays.observed) { launches[launches.length - 1].failed = true; launches[launches.length - 1].driver_error = 'DRIVER_STRAY_PROCESS_NOT_REMOVED'; break; }
    }
  } finally {
    writeJson(path.join(ctx.attemptDir, 'driver-launches.json'), { schema_version: 1, driver_sha256: runtime.driverSha256 || null, launches });
    fs.writeFileSync(path.join(ctx.attemptDir, 'product.log'), productLog.join('\n'), 'utf8');
    await fixture.close();
  }
  if (ctx.phase === 'p03-chain') finishChainEvidence(ctx, launches, identityAssertion, exec, dataRoot);
  if (ctx.phase === 'p05-session-bg') await finishReleaseEvidence(ctx, launches, exec,
    hooks || { killProcess: (pid) => killProcess(pid, cleanupScopes.get('release_exit')) });
  const failedLaunch = launches.find((item) => item.failed);
  return finishPhase(ctx, failedLaunch ? `DRIVER_${failedLaunch.mode.toUpperCase()}_FAILED` : ctx.contractError ? 'DRIVER_CONTRACT_MISMATCH' : null);
}

// The chain closes with facts only the parent can observe after the product process is gone.
function finishChainEvidence(ctx, launches, identityAssertion, exec, dataRoot) {
  if (identityAssertion) applyAssertions(ctx, [identityAssertion]);
  const exit = launches.find((item) => item.mode === 'chain_exit');
  const treeFile = path.join(ctx.attemptDir, 'chain-exit-tree-before.json');
  let before = [];
  // The tree is observed only when the driver recorded it with no failed query; otherwise absence proves nothing (UNKNOWN).
  let treeObserved = false;
  if (fs.existsSync(treeFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(treeFile, 'utf8'));
      before = Array.isArray(parsed.tree) ? parsed.tree : [];
      treeObserved = Array.isArray(parsed.tree) && parsed.wmic_failures === 0;
    } catch (_error) { before = []; treeObserved = false; }
  }
  const listing = listProcesses(exec);
  const rows = listing.rows;
  const listingFailed = listing.failed;
  const absenceObservedAt = new Date().toISOString();
  const survivors = before.filter((item) => rows.some((row) => Number(row.ProcessId) === item.pid && (row.CreationDate || '') === item.created));
  const stateDb = path.join(dataRoot, 'a9-state.db');
  if (fs.existsSync(stateDb)) fs.copyFileSync(stateDb, path.join(ctx.attemptDir, 'state.sqlite'));
  writeJson(path.join(ctx.attemptDir, '06-held-exit.json'), { exit: exit ? { code: exit.code, signal: exit.signal, killed_by: exit.killed_by, started_at: exit.started_at, ended_at: exit.ended_at, duration_ms: exit.duration_ms, pid: exit.pid, dialog_click: exit.dialog_click } : null,
    exit_code_scope: 'the product process the parent launched; descendants are checked by creation-date identity only, their exit codes cannot be read from outside',
    tree_before: before, tree_observed: treeObserved, absence_observed_at: absenceObservedAt, survivors, processes_listed: rows.length, listing_failed: listingFailed });
  const roots = [ctx.candidateRoot, path.join(ctx.runRoot, 'driver-electron')].map((item) => item.toLowerCase());
  // The smoke itself is the candidate's electron.exe (ELECTRON_RUN_AS_NODE), so its own row is not residue; the post-flight phase excludes it the same way.
  const own = new Set([ctx.pid, process.ppid]);
  const residue = rows.filter((row) => !own.has(Number(row.ProcessId)) && roots.some((root) => String(row.ImagePath || '').toLowerCase().startsWith(root))).map((row) => ({ pid: Number(row.ProcessId), name: row.Name, image_source: row.ImageSource }));
  writeJson(path.join(ctx.attemptDir, '06-postflight.json'), { residue, survivors: survivors.length, processes_listed: rows.length, own_pids_excluded: [...own] });
  const created = fixtures.evidenceForPhase(ctx.phase);
  const manifest = buildEvidenceManifest(ctx.attemptDir, [path.join(ctx.attemptDir, 'evidence-manifest.json'), path.join(ctx.attemptDir, 'phase-result.json')]);
  writeJson(path.join(ctx.attemptDir, 'evidence-manifest.json'), manifest);
  const listed = new Set(manifest.files.map((item) => item.path));
  const missing = created.filter((name) => name !== 'phase-result.json' && !listed.has(name));
  const exitOk = Boolean(exit) && exit.code === 0 && !exit.killed_by && !exit.spawn_error && Boolean(exit.dialog_click) && exit.dialog_click.status === 0;
  // A tree that was not observed (failed query, missing or empty record) or a listing that failed cannot show absence: UNKNOWN.
  const unobserved = !treeObserved || before.length === 0 || listingFailed || rows.length === 0;
  const status = !exit ? 'NOT_PERFORMED'
    : !exitOk || survivors.length > 0 || residue.length > 0 || missing.length > 1 ? 'FAIL'
      : unobserved ? 'UNKNOWN' : 'PASS';
  applyAssertions(ctx, [{ case_id: 'B2-CH-06-NORMAL-EXIT', assertion_id: 'B2-CH-06-NORMAL-EXIT-A02', status,
    observed: exit ? `exit_code=${exit.code}; killed_by=${exit.killed_by}; ended_at=${exit.ended_at}; dialog_click_status=${exit.dialog_click && exit.dialog_click.status}; tree_observed=${treeObserved}; tree_before=${before.length}; listing_failed=${listingFailed}; absence_observed_at=${absenceObservedAt}; survivors=${survivors.length}; residue=${residue.length}; missing_evidence=${missing.join(',') || 'none'}` : 'chain_exit did not run' }]);
}

// ---- Release exit (B2-BG-03 A02) -------------------------------------------------------------------------------------
// The driver chose "leave to system" in the product's own exit dialog. After the product process is gone the parent observes four facts:
// the exit was clean, the released command is still alive (identity: id and creation stamp recorded before the exit), no product or driver
// process is left, and the suite then removes the released command by identity and sees it gone. The removal is the suite cleaning up what
// it started: the recorded instances and descendants found while a recorded instance was alive by identity.
const RELEASE_PRODUCT_SETTLE_ROUNDS = 10;
const RELEASE_CLEANUP_ROUNDS = 8;
const RELEASE_CLEANUP_CLEAN_ROUNDS = 2;
// An instance is the same process only when the id and a non-blank creation stamp both match; a blank stamp is no identity (codex round 16, P1).
function aliveByIdentity(items, rows) {
  const now = new Map(rows.map((row) => [Number(row.ProcessId), String(row.CreationDate || '')]));
  return items.filter((item) => Boolean(item.created) && now.has(item.pid) && now.get(item.pid) === item.created);
}
// Live children of the given instances found by parent id. A child created before its parent is a stale link and is left alone.
// Creation stamps of one machine share the offset, so they compare as text.
function liveDescendants(rows, roots) {
  const byParent = new Map();
  for (const row of rows) {
    const parent = Number(row.ParentProcessId);
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(row);
  }
  const found = [];
  const seen = new Set(roots.map((item) => item.pid));
  const stack = roots.map((item) => ({ pid: item.pid, created: item.created }));
  while (stack.length) {
    const parent = stack.pop();
    for (const child of byParent.get(parent.pid) || []) {
      const pid = Number(child.ProcessId);
      const created = String(child.CreationDate || '');
      if (seen.has(pid) || (parent.created && created && created < parent.created)) continue;
      seen.add(pid);
      found.push({ pid, parent: parent.pid, name: String(child.Name || ''), created });
      stack.push({ pid, created });
    }
  }
  return found;
}
// The suite removes only instances it can identify: the driver recorded their id and creation stamp before the exit, or they were found below an
// instance that was alive by identity. Every instance found stays tracked in all later rounds, so a child that outlives its killed parent is
// still removed and still counted (codex round 16, P1: a child seen once was dropped when its parent disappeared).
async function removeReleasedCommand(exec, items, own, hooks, observedListings = []) {
  const kill = (hooks && hooks.killProcess) || killProcess;
  const wait = (hooks && hooks.wait) || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const keyOf = (item) => `${item.pid}:${item.created}`;
  const tracked = new Map();
  const unidentified = [];
  for (const item of items) {
    if (item && Number.isInteger(item.pid) && item.created) tracked.set(keyOf(item), { pid: item.pid, created: item.created, name: item.name || '' });
    else unidentified.push({ pid: item ? item.pid : null, name: item ? item.name || '' : '' });
  }
  const remember = (rows) => {
    const roots = aliveByIdentity([...tracked.values()], rows).filter((item) => !own.has(item.pid));
    const children = liveDescendants(rows, roots).filter((item) => !own.has(item.pid));
    for (const child of children) {
      if (child.created) tracked.set(keyOf(child), child);
      else if (!unidentified.some((item) => item.pid === child.pid)) unidentified.push({ pid: child.pid, name: child.name });
    }
    // A known id whose stamp cannot be read is not an observed absence. It must not be killed by bare id either.
    for (const item of tracked.values()) {
      if (!own.has(item.pid) && rows.some((row) => Number(row.ProcessId) === item.pid && !String(row.CreationDate || '').trim())
        && !unidentified.some((unknown) => unknown.pid === item.pid)) unidentified.push({ pid: item.pid, name: item.name });
    }
    return [...roots, ...children];
  };
  // The first post-exit sample and every product-settle sample are observations too. Retain their instances before querying again.
  const samplesBeforeCleanup = observedListings.map((sample) => ({ t: sample.t, instances: remember(sample.rows) }));
  const attempted = [];
  let clean = 0;
  let lastAlive = [];
  for (let round = 0; round < RELEASE_CLEANUP_ROUNDS && clean < RELEASE_CLEANUP_CLEAN_ROUNDS; round += 1) {
    const listing = listProcesses(exec);
    remember(listing.rows);
    const targets = aliveByIdentity([...tracked.values()], listing.rows).filter((item) => !own.has(item.pid));
    lastAlive = targets;
    if (targets.length) {
      clean = 0;
      for (const target of targets) {
        kill(target.pid);
        if (!attempted.some((item) => item.pid === target.pid && item.created === target.created)) attempted.push(target);
      }
    // A listing that failed or showed nothing usable shows presence at most, never absence: it is not a clean round.
    } else if (!usableProcessListing(listing)) clean = 0;
    else clean += 1;
    await wait(STRAY_SWEEP_WAIT_MS);
  }
  // An instance without a creation stamp cannot be told from a reused id: it is neither killed nor called gone.
  const observed = clean >= RELEASE_CLEANUP_CLEAN_ROUNDS && unidentified.length === 0;
  return { attempted, observed, remaining: observed ? [] : lastAlive, unidentified, samples_before_cleanup: samplesBeforeCleanup };
}
// PASS needs every check to be exactly true; a missing, null or non-boolean value is not observed (codex round 16, P2: undefined was read as PASS).
function releaseStatus(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return 'UNKNOWN';
  return checks.includes(false) ? 'FAIL' : checks.every((item) => item === true) ? 'PASS' : 'UNKNOWN';
}
async function finishReleaseEvidence(ctx, launches, exec, hooks) {
  const exit = launches.find((item) => item.mode === 'release_exit');
  if (!exit) return;
  const wait = (hooks && hooks.wait) || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const readJson = (name) => { try { return JSON.parse(fs.readFileSync(path.join(ctx.attemptDir, name), 'utf8')); } catch (_error) { return null; } };
  const before = readJson('release-exit-before.json');
  const dialog = readJson('release-dialog-response.json');
  const ownership = readJson('release-ownership-events.json');
  const commandTree = before && Array.isArray(before.command_tree) ? before.command_tree : [];
  // The released command is identified only when the driver recorded its tree with no failed query; otherwise nothing is judged alive or gone.
  const treeObserved = Boolean(before) && before.wmic_failures === 0 && commandTree.length > 0;
  // The released command is the process of the handle itself: the id the product reported for the handle, found in the recorded tree with a creation stamp.
  // Another process of the tree being alive proves nothing about it (codex round 16, P1).
  const handlePid = before && before.handle && Number.isInteger(before.handle.pid) ? before.handle.pid : null;
  const releasedRoot = handlePid === null ? null : commandTree.find((item) => item.pid === handlePid && item.created) || null;
  const rootKnown = treeObserved && releasedRoot !== null && before.handle_pid_in_command_tree === true;
  const own = new Set([ctx.pid, process.ppid]);
  const roots = [ctx.candidateRoot, path.join(ctx.runRoot, 'driver-electron')].map((item) => item.toLowerCase().replace(/[\\/]+$/, ''));
  const underRoot = (image, root) => image === root || image.startsWith(`${root}\\`) || image.startsWith(`${root}/`);
  const productResidueOf = (rows) => rows.filter((row) => !own.has(Number(row.ProcessId)) && roots.some((root) => underRoot(String(row.ImagePath || '').toLowerCase(), root)))
    .map((row) => ({ pid: Number(row.ProcessId), name: row.Name, image_source: row.ImageSource }));
  const first = listProcesses(exec);
  const commandObservations = [{ t: 0, rows: first.rows }];
  const firstAt = new Date().toISOString();
  const aliveAfterExit = aliveByIdentity(commandTree, first.rows).filter((item) => !own.has(item.pid));
  const rootIdentityUnreadable = rootKnown && first.rows.some((row) => Number(row.ProcessId) === releasedRoot.pid && !String(row.CreationDate || '').trim());
  const rootAliveAfterExit = rootKnown && !rootIdentityUnreadable ? aliveAfterExit.some((item) => item.pid === releasedRoot.pid && item.created === releasedRoot.created) : null;
  // Product processes can still be closing when the driver reports its exit: a bounded settle, every sample kept.
  const samples = [{ t: 0, residue: productResidueOf(first.rows) }];
  let last = first;
  for (let round = 1; round <= RELEASE_PRODUCT_SETTLE_ROUNDS && samples[samples.length - 1].residue.length > 0; round += 1) {
    await wait(1000);
    last = listProcesses(exec);
    commandObservations.push({ t: round * 1000, rows: last.rows });
    samples.push({ t: round * 1000, residue: productResidueOf(last.rows) });
  }
  const productResidue = samples[samples.length - 1].residue;
  const cleanup = commandTree.length > 0 ? await removeReleasedCommand(exec, commandTree, own, hooks, commandObservations) : { attempted: [], observed: false, remaining: [], unidentified: [], samples_before_cleanup: [] };
  const exitOk = exit.code === 0 && !exit.killed_by && !exit.spawn_error && Boolean(exit.dialog_click) && exit.dialog_click.status === 0;
  const dialogOk = dialog ? dialog.timed_out === false && dialog.buttons_ok === true && dialog.returned_index === 1 : null;
  const sequence = ownership && ownership.sequence ? ownership.sequence : null;
  const sequenceOk = sequence && typeof sequence.ok === 'boolean' ? sequence.ok : null;
  const firstUsable = usableProcessListing(first);
  // Alive: the handle's own process, same id and creation stamp. Gone: a usable listing without it. A root that could not be identified is not judged.
  const aliveOk = !rootKnown || rootIdentityUnreadable ? null : rootAliveAfterExit ? true : firstUsable ? false : null;
  const residueOk = productResidue.length > 0 ? false : usableProcessListing(last) ? true : null;
  const cleanupOk = cleanup.observed ? true : cleanup.remaining.length > 0 ? false : null;
  const status = releaseStatus([exitOk, dialogOk, sequenceOk, aliveOk, residueOk, cleanupOk]);
  writeJson(path.join(ctx.attemptDir, 'release-held-exit.json'), { exit: { code: exit.code, signal: exit.signal, killed_by: exit.killed_by, started_at: exit.started_at, ended_at: exit.ended_at, duration_ms: exit.duration_ms, pid: exit.pid, dialog_click: exit.dialog_click },
    exit_code_scope: 'the product process the parent launched; the released command is checked by id and creation stamp only, its exit code is not read',
    tree_observed: treeObserved, command_tree: commandTree, released_root: releasedRoot, root_identified: rootKnown, root_alive_after_exit: rootAliveAfterExit,
    first_listed_at: firstAt, listing_failed: first.failed, processes_listed: first.rows.length, alive_after_exit: aliveAfterExit,
    product_residue_samples: samples, product_residue: productResidue,
    cleanup: { attempted: cleanup.attempted, observed: cleanup.observed, remaining: cleanup.remaining, unidentified: cleanup.unidentified, samples_before_cleanup: cleanup.samples_before_cleanup }, own_pids_excluded: [...own],
    checks: { exit_ok: exitOk, dialog_ok: dialogOk, ownership_sequence_ok: sequenceOk, released_alive_after_exit: aliveOk, no_product_process_left: residueOk, released_removed_by_suite: cleanupOk } });
  applyAssertions(ctx, [{ case_id: 'B2-BG-03-STOP-RELEASE-EXIT', assertion_id: 'B2-BG-03-STOP-RELEASE-EXIT-A02', status,
    observed: `exit_code=${exit.code}; killed_by=${exit.killed_by}; dialog_click_status=${exit.dialog_click && exit.dialog_click.status}; dialog_ok=${dialogOk}; ownership=${sequence ? sequence.sequence.join('>') || 'none' : 'unread'}; same_release_id=${sequence ? sequence.same_release_id : 'unread'}; tree_observed=${treeObserved}; command_tree=${commandTree.length}; root_identified=${rootKnown}; root_alive=${rootAliveAfterExit}; alive_after_exit=${aliveAfterExit.length}; product_residue=${productResidue.length}; listing_failed=${last.failed}; removed_by_suite=${cleanup.attempted.length}; cleanup_observed=${cleanup.observed}; left_after_cleanup=${cleanup.remaining.length}` }]);
}

function runPostflightPhase(ctx, exec = realExec) {
  const secretLiteral = fixtures.testOnlySecret();
  const scan = scanRun(ctx.runRoot, secretLiteral);
  writeEvidence(ctx, 'g4-secret-scan.json', { schema_version: 1, ...scan });
  const listing = listProcesses(exec);
  const processes = listing.rows;
  const roots = [ctx.candidateRoot, path.join(ctx.runRoot, 'driver-electron'), ctx.runRoot].map((item) => item.toLowerCase());
  const own = new Set([ctx.pid, process.ppid]);
  const residue = processes.filter((row) => !own.has(Number(row.ProcessId)) && roots.some((root) => String(row.ImagePath || '').toLowerCase().startsWith(root)))
    .map((row) => ({ pid: Number(row.ProcessId), name: row.Name, path: String(row.ImagePath).slice(0, 260), image_source: row.ImageSource }));
  writeEvidence(ctx, 'g4-postflight.json', { schema_version: 1, processes_total: processes.length, listing_failed: listing.failed, residue, ledger_lines: requests.readLedger(ctx.runRoot).length });
  const ledgerFile = path.join(ctx.runRoot, requests.LEDGER_FILE);
  const manifest = buildEvidenceManifest(ctx.runRoot, [path.join(ctx.attemptDir, 'evidence-manifest.json'), path.join(ctx.attemptDir, 'phase-result.json')]);
  manifest.ledger_sha256_at_manifest = fs.existsSync(ledgerFile) ? sha256File(ledgerFile) : null;
  writeEvidence(ctx, 'evidence-manifest.json', manifest);
  const [secretCase, postflightCase] = fixtures.casesForPhase('p10-postflight');
  const caseId = secretCase.case_id;
  const ids = secretCase.assertions.map((a) => a.assertion_id);
  applyAssertions(ctx, [
    { case_id: caseId, assertion_id: ids[0], status: scan.positive_control_detected && scan.phase2_controls_detected && scan.findings.length === 0 ? 'PASS' : 'FAIL',
      observed: `files_scanned=${scan.files_scanned}; findings=${scan.findings.length}; positive_control_detected=${scan.positive_control_detected}` },
    { case_id: caseId, assertion_id: ids[1], status: residue.length > 0 ? 'FAIL' : listing.failed || processes.length === 0 ? 'UNKNOWN' : manifest.files.length > 0 ? 'PASS' : 'FAIL',
      observed: `residue=${residue.length}; processes_total=${processes.length}; listing_failed=${listing.failed}; manifest_files=${manifest.files.length}` },
  ]);
  void postflightCase;
  return finishPhase(ctx, scan.findings.length ? 'SECRET_FOUND' : residue.length ? 'PROCESS_RESIDUE' : null);
}

async function main(argv = process.argv.slice(2), environment = {}) {
  const ctx = createContext(argv, environment);
  if (ctx.phase === 'p01-env') runEnvironmentPhase(ctx);
  else if (DRIVER_PLANS[ctx.phase]) await runDriverPhase(ctx);
  else if (ctx.phase === 'p10-postflight') runPostflightPhase(ctx);
  else throw new Error(`A9_BATCH2_SMOKE_PHASE_UNSUPPORTED:${ctx.phase}`);
  process.stdout.write(`${JSON.stringify({ phase: ctx.phase, status: ctx.result.status, failure_class: ctx.result.failure_class })}\n`);
  process.exitCode = ctx.result.status === 'PASS' ? 0 : 1;
  return ctx.result;
}

module.exports = {
  main, createContext, runEnvironmentPhase, runDriverPhase, runPostflightPhase, finishPhase, applyAssertions, writeEvidence,
  collectEnvironment, evaluateEnvironment, listProcesses, listCommandLines, readWmicList, withImagePath, parseWmicCsv, parseCsvLine, parseWhoamiSid, parseIntegrity, scanBytesForSecrets, scanRun, buildEvidenceManifest,
  phase2PostExit, ProviderFixture, PHASE2_MODES, DRIVER_MODES, DRIVER_PLANS, FIXED_COMMANDS, prepareDriverRuntime, copyRuntimeFile, parseCsvLineStrict, readWmicTable, usableProcessListing, findDriverStrays, sweepDriverStrays, launchDriver, realExec, MIN_FREE_BYTES,
  CORRUPT_MODE_SETTINGS, findModeSettingsFile, corruptModeSettings, restoreModeSettings,
  chainIdentityAssertion, finishChainEvidence, finishReleaseEvidence, removeReleasedCommand, aliveByIdentity, liveDescendants, releaseStatus, killProcess, clickExitDialog, toolParameterNames, recoveryUnknownCount, killTree,
  cleanupIdentity, sameCleanupIdentity, cleanupEnvironment, cleanupWmi, matchesFixtureCommand, fixtureCommandInvocation, captureFixtureCleanup, createCleanupScope,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
