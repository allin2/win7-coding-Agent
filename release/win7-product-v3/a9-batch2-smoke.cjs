// A9-33 batch2 smoke runner (WIN7-43 tentative, ADR-0155 Proposed).
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

// A process listing is observed only when the command ran, exited 0, reported no error and was not cut off. A thrown error,
// a non-zero status, an error object or a cut-off output means the rows are partial and prove nothing about absence: callers
// must not turn them into "absent". The complete rows such a listing did print are still evidence of presence, so they are
// kept (failed is true) and a survivor or residue found in them is a failure.
function listProcesses(exec) {
  let result;
  try { result = exec('wmic_processes'); } catch (_error) { return { rows: [], failed: true }; }
  if (!result) return { rows: [], failed: true };
  if (result.status !== 0 || result.error || result.truncated === true) return { rows: parseWmicCsv(result.stdout, { completeOnly: true }), failed: true };
  return { rows: parseWmicCsv(result.stdout), failed: false };
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
    const exe = String(row.ExecutablePath || '').toLowerCase();
    const name = String(row.Name || '').toLowerCase();
    return normalizedRoots.some((root) => root && exe.startsWith(root)) || ['spike02_helper.exe', 'helper.exe'].includes(name);
  }).map((row) => ({ pid: Number(row.ProcessId), parent: Number(row.ParentProcessId), name: row.Name, path: row.ExecutablePath, session: Number(row.SessionId) }));
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
  for (const literal of extraLiterals || []) if (literal && text.includes(literal)) hits.push('configured-secret-literal');
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
  let scanned = 0;
  for (const file of listFilesRecursive(runRoot)) {
    if (/\.(png|sqlite|db|ico|pak)$/i.test(file)) continue;
    scanned += 1;
    const hits = scanBytesForSecrets(fs.readFileSync(file), [secretLiteral]);
    if (hits.length) findings.push({ file: path.relative(runRoot, file), hits });
  }
  return { positive_control_detected: controlHits.includes('configured-secret-literal') && controlHits.includes('bearer-token') && controlHits.includes('api-key-prefix'),
    control_hits: controlHits, files_scanned: scanned, findings };
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

class ProviderFixture {
  constructor(logFile) {
    this.logFile = logFile;
    this.state = { shellKind: 'cmd', afterHold: false, holdNext: false };
    this.requestCount = 0;
    this.toolMessageCount = 0;
    this.heldCount = 0;
    this.holdSockets = [];
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
      this.requestCount += 1;
      const messages = (parsed && parsed.messages) || [];
      this.toolMessageCount = messages.filter((item) => item.role === 'tool').length;
      const { prompt } = fixtures.lastUserPrompt(parsed || {});
      const hold = this.state.holdNext === true;
      const step = hold ? { hold: true } : fixtures.providerStep(parsed || {}, this.state);
      if (hold) this.state.holdNext = false;
      fs.appendFileSync(this.logFile, `${JSON.stringify({ index: this.requestCount, at: new Date().toISOString(), tools_offered: Array.isArray(parsed.tools) ? parsed.tools.length : 0,
        tool_params: toolParameterNames(parsed), messages: messages.length, tool_messages: this.toolMessageCount, prompt_head: prompt.slice(0, 80),
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
      response.end(JSON.stringify({ requests: this.requestCount, tool_messages: this.toolMessageCount, held: this.heldCount, state: this.state }));
      return;
    }
    if (request.method === 'POST' && request.url === '/__b2/state') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        try {
          const next = JSON.parse(body);
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
const DRIVER_MODES = Object.freeze({
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
  'p05-session-bg': ['session_bg', 'session_restart'],
  'p06-continue': ['continue_guards', 'continue_interrupt', 'continue_restart', 'continue_unknown_interrupt', 'continue_mode_guard', 'continue_unknown'],
  'p07-safe': ['safe_rules'],
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

function prepareDriverRuntime(candidateRoot, runRoot) {
  const runtimeRoot = path.join(runRoot, 'driver-electron');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  for (const entry of fs.readdirSync(candidateRoot, { withFileTypes: true })) {
    if (entry.isFile()) fs.copyFileSync(path.join(candidateRoot, entry.name), path.join(runtimeRoot, entry.name));
  }
  for (const directory of ['locales', 'swiftshader']) {
    const source = path.join(candidateRoot, directory);
    if (fs.existsSync(source)) copyTree(source, path.join(runtimeRoot, directory));
  }
  fs.mkdirSync(path.join(runtimeRoot, 'resources'), { recursive: true });
  fs.copyFileSync(path.join(candidateRoot, 'resources', 'default_app.asar'), path.join(runtimeRoot, 'resources', 'default_app.asar'));
  const appRoot = path.join(runRoot, 'driver-app');
  fs.mkdirSync(appRoot, { recursive: true });
  const driverSource = path.join(candidateRoot, 'validation', 'a9-batch2-driver.cjs');
  fs.copyFileSync(driverSource, path.join(appRoot, 'main.cjs'));
  fs.writeFileSync(path.join(appRoot, 'package.json'), `${JSON.stringify({ name: 'a9-batch2-driver', version: '1.0.0', main: 'main.cjs', private: true }, null, 2)}\n`, 'utf8');
  return { electronPath: path.join(runtimeRoot, 'electron.exe'), appRoot, driverSha256: sha256File(driverSource) };
}
function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to); else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function killTree(pid) {
  if (process.platform === 'win32') childProcess.spawnSync('taskkill.exe', ['/PID', String(Number(pid)), '/T', '/F'], { windowsHide: true, timeout: 30000 });
  else { try { process.kill(pid, 'SIGKILL'); } catch (_error) { /* gone */ } }
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
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-262144); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-262144); });
    const timer = setTimeout(() => { killedBy = 'timeout'; killTree(child.pid); }, options.timeoutMs);
    const poll = setInterval(() => {
      if (options.killMarker && !killedBy && fs.existsSync(options.killMarker)) { killedBy = 'marker'; killTree(child.pid); }
      if (options.dialogMarker && !dialogClick && fs.existsSync(options.dialogMarker)) {
        dialogClick = { at: new Date().toISOString(), ...(options.clickDialog ? options.clickDialog(child.pid) : { status: null, stdout: '', stderr: 'no click helper' }) };
      }
    }, 200);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearInterval(poll);
      resolve({ code: code === null ? null : code, signal: signal || null, killed_by: killedBy, duration_ms: Date.now() - started, started_at: new Date(started).toISOString(),
        ended_at: new Date().toISOString(), stdout, stderr, pid: child.pid, dialog_click: dialogClick });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      clearInterval(poll);
      resolve({ code: null, signal: null, killed_by: killedBy, duration_ms: Date.now() - started, stdout, stderr, pid: child.pid, dialog_click: dialogClick,
        spawn_error: String(error && error.message ? error.message : error).slice(0, 300) });
    });
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

async function runDriverPhase(ctx, hooks) {
  const plan = DRIVER_PLANS[ctx.phase];
  if (!plan) throw new Error(`A9_BATCH2_PHASE_NOT_A_DRIVER_PHASE:${ctx.phase}`);
  const launch = (hooks && hooks.launchDriver) || launchDriver;
  const exec = (hooks && hooks.exec) || realExec;
  const runtime = (hooks && hooks.runtime) || prepareDriverRuntime(ctx.candidateRoot, ctx.runRoot);
  const providerLog = path.join(ctx.attemptDir, 'provider-requests.jsonl');
  fs.mkdirSync(ctx.attemptDir, { recursive: true });
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
  const productLog = [];
  let identityAssertion = null;
  try {
    if (ctx.phase === 'p03-chain') identityAssertion = chainIdentityAssertion(ctx, exec);
    for (const mode of plan) {
      const spec = DRIVER_MODES[mode];
      fixture.state.afterHold = false;
      fixture.state.holdNext = false;
      const driverResultFile = path.join(ctx.attemptDir, `driver-${mode}.json`);
      const killMarker = spec.killOnMarker ? path.join(ctx.attemptDir, `${mode}.ready`) : null;
      const dialogMarker = spec.dialogButton !== undefined ? path.join(ctx.attemptDir, 'dialog-shown.marker') : null;
      const env = {
        A9_BATCH2_PHASE: ctx.phase, A9_BATCH2_MODE: mode, A9_BATCH2_RUN_ID: ctx.runId, A9_BATCH2_ATTEMPT_DIR: ctx.attemptDir,
        A9_BATCH2_DRIVER_RESULT: driverResultFile, A9_BATCH2_WORKSPACE: workspaceRoot, A9_BATCH2_DATAROOT: dataRoot,
        A9_BATCH2_FIXTURE_URL: `http://127.0.0.1:${port}/v1`, A9_BATCH2_FIXTURE_CONTROL: `http://127.0.0.1:${port}/__b2`, A9_BATCH2_PROVIDER_LOG: providerLog,
        A9_BATCH2_PRODUCT_MAIN: path.join(ctx.candidateRoot, 'resources', 'app', 'product', 'main.js'),
        A9_BATCH2_CANDIDATE_ROOT: ctx.candidateRoot, A9_BATCH2_SECRET_LITERAL: fixtures.testOnlySecret(),
        WIN7AGENT_A9_DATAROOT: dataRoot,
        WIN7AGENT_A9_ELECTRON_SQLITE: path.join(ctx.candidateRoot, 'resources', 'native', 'storage'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      };
      const modeSettings = spec.corruptModeSettings ? corruptModeSettings(dataRoot) : null;
      if (modeSettings) env.A9_BATCH2_MODE_SETTINGS_CORRUPTED = modeSettings.corrupted ? '1' : '0';
      let exit;
      try {
        exit = await launch(runtime, env, { timeoutMs: spec.timeoutMs, killMarker, dialogMarker,
          clickDialog: (pid) => (hooks && hooks.clickDialog ? hooks.clickDialog(pid, spec.dialogButton) : clickExitDialog(controllerScript, pid, spec.dialogButton)) });
      } finally {
        // The next mode must start from the original settings whatever happened to this one.
        if (modeSettings) modeSettings.restore = restoreModeSettings(modeSettings);
      }
      launches.push({ mode, code: exit.code, signal: exit.signal, killed_by: exit.killed_by, duration_ms: exit.duration_ms, started_at: exit.started_at, ended_at: exit.ended_at,
        spawn_error: exit.spawn_error || null, pid: exit.pid, dialog_click: exit.dialog_click || null,
        ...(modeSettings ? { mode_settings: { files_found: modeSettings.files_found, corrupted: modeSettings.corrupted, original_sha256: modeSettings.original_sha256, error: modeSettings.error, restore: modeSettings.restore } } : {}) });
      productLog.push(`==== ${mode} (exit=${exit.code}; killed_by=${exit.killed_by}) ====\n${exit.stdout}\n${exit.stderr}\n`);
      let driverResult = null;
      if (fs.existsSync(driverResultFile)) { try { driverResult = JSON.parse(fs.readFileSync(driverResultFile, 'utf8')); } catch (_error) { driverResult = null; } }
      if (driverResult && Array.isArray(driverResult.assertions)) applyAssertions(ctx, driverResult.assertions);
      if (driverResult && driverResult.status === 'ERROR') { launches[launches.length - 1].failed = true; launches[launches.length - 1].driver_error = String(driverResult.error || '').slice(0, 400); break; }
      // A driver that was not supposed to die, or exited non-zero without a result, makes its mode a failure.
      if (!spec.killOnMarker && (exit.code !== 0 || !driverResult)) { launches[launches.length - 1].failed = true; break; }
      if (spec.killOnMarker && exit.killed_by !== 'marker') { launches[launches.length - 1].failed = true; break; }
    }
  } finally {
    writeJson(path.join(ctx.attemptDir, 'driver-launches.json'), { schema_version: 1, driver_sha256: runtime.driverSha256 || null, launches });
    fs.writeFileSync(path.join(ctx.attemptDir, 'product.log'), productLog.join('\n'), 'utf8');
    await fixture.close();
  }
  if (ctx.phase === 'p03-chain') finishChainEvidence(ctx, launches, identityAssertion, exec, dataRoot);
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
  const residue = rows.filter((row) => !own.has(Number(row.ProcessId)) && roots.some((root) => String(row.ExecutablePath || '').toLowerCase().startsWith(root))).map((row) => ({ pid: Number(row.ProcessId), name: row.Name }));
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

function runPostflightPhase(ctx, exec = realExec) {
  const secretLiteral = fixtures.testOnlySecret();
  const scan = scanRun(ctx.runRoot, secretLiteral);
  writeEvidence(ctx, 'g4-secret-scan.json', { schema_version: 1, ...scan });
  const listing = listProcesses(exec);
  const processes = listing.rows;
  const roots = [ctx.candidateRoot, path.join(ctx.runRoot, 'driver-electron'), ctx.runRoot].map((item) => item.toLowerCase());
  const own = new Set([ctx.pid, process.ppid]);
  const residue = processes.filter((row) => !own.has(Number(row.ProcessId)) && roots.some((root) => String(row.ExecutablePath || '').toLowerCase().startsWith(root)))
    .map((row) => ({ pid: Number(row.ProcessId), name: row.Name, path: row.ExecutablePath }));
  writeEvidence(ctx, 'g4-postflight.json', { schema_version: 1, processes_total: processes.length, listing_failed: listing.failed, residue, ledger_lines: requests.readLedger(ctx.runRoot).length });
  const ledgerFile = path.join(ctx.runRoot, requests.LEDGER_FILE);
  const manifest = buildEvidenceManifest(ctx.runRoot, [path.join(ctx.attemptDir, 'evidence-manifest.json'), path.join(ctx.attemptDir, 'phase-result.json')]);
  manifest.ledger_sha256_at_manifest = fs.existsSync(ledgerFile) ? sha256File(ledgerFile) : null;
  writeEvidence(ctx, 'evidence-manifest.json', manifest);
  const [secretCase, postflightCase] = fixtures.casesForPhase('p10-postflight');
  const caseId = secretCase.case_id;
  const ids = secretCase.assertions.map((a) => a.assertion_id);
  applyAssertions(ctx, [
    { case_id: caseId, assertion_id: ids[0], status: scan.positive_control_detected && scan.findings.length === 0 ? 'PASS' : 'FAIL',
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
  collectEnvironment, evaluateEnvironment, listProcesses, parseWmicCsv, parseCsvLine, parseWhoamiSid, parseIntegrity, scanBytesForSecrets, scanRun, buildEvidenceManifest,
  ProviderFixture, DRIVER_MODES, DRIVER_PLANS, FIXED_COMMANDS, prepareDriverRuntime, launchDriver, realExec, MIN_FREE_BYTES,
  CORRUPT_MODE_SETTINGS, findModeSettingsFile, corruptModeSettings, restoreModeSettings,
  chainIdentityAssertion, finishChainEvidence, clickExitDialog, toolParameterNames, recoveryUnknownCount, killTree,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
