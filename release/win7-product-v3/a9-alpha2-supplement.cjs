'use strict';

// Fixed A9-36 test inputs and runner; never included in or written into the frozen candidate.
const fs = require('fs');
const path = require('path');
const http = require('http');
const childProcess = require('child_process');
const contract = require('./a9-alpha2-supplement-request.cjs');
const os = require('os');
const crypto = require('crypto');
// Exact original W42 nineteen inputs; source file SHA256 1d0539c8e9a5b76541fe7ef55c59313fdc33bfadd13ffdaa765606e95c0dd6fb
const GIT_FORMS = Object.freeze([
  "cmd /c \"git push origin main\"",
  "cmd /c\"git push origin main\"",
  "cmd /C\"git push origin main\"",
  "cmd.exe /d /s /c\"C:\\g\\git.exe push origin main\"",
  "cmd /s/c \"git push origin main\"",
  "cmd /R \"git push origin main\"",
  "powershell -co \"git push origin main\"",
  "powershell -Com \"git push origin main\"",
  "powershell /Command \"git push origin main\"",
  "powershell -NoProfile -c\"git push origin main\"",
  "powershell -e ZwBpAHQAIABwAHUAcwBoACAAbwByAGkAZwBpAG4AIABtAGEAaQBuAA==",
  "powershell -ec ZwBpAHQAIABwAHUAcwBoACAAbwByAGkAZwBpAG4AIABtAGEAaQBuAA==",
  "bash -c\"git push origin main\"",
  "bash -lc \"git push origin main\"",
  "sh -ec \"git push origin main\"",
  "bash -c \"git push origin main\"",
  "cmd /c \"" + 'p'.repeat(270000) + " git push origin main\"",
  "powershell \"git push origin main\"",
  "powershell -NoProfile \"git push origin main\""
]);
const TEST_SOURCE = "from pathlib import Path\nimport sys\nvalue=Path('probe.txt').read_text(encoding='utf-8').strip()\nprint('A2-CHECK',value)\nif '--large-fail' in sys.argv:\n print('F'*20000)\n sys.exit(1)\nsys.exit(0 if value.startswith('value ') else 1)\n";
const JOURNEY_FILES = Object.freeze({
  'AGENTS.md': '# A2-JOURNEY-RULE\nRead the task and relevant source before editing. Use python test_calc.py for tests and python build.py for build. Keep changes inside this workspace.\n',
  'README.md': 'Tiny calculator. calc.py:add is wrong. Tests are intentionally red. display.py formats results.\n',
  'calc.py': 'def add(a, b):\n    return a - b\n',
  'display.py': 'from calc import add\n\ndef format_sum(a, b):\n    return str(add(a, b))\n',
  'test_calc.py': 'import unittest\nfrom calc import add\nfrom display import format_sum\n\nclass CalcTests(unittest.TestCase):\n def test_add(self):\n  self.assertEqual(add(2, 3), 5)\n def test_display(self):\n  self.assertEqual(format_sum(2, 3), "5")\n\nif __name__ == "__main__":\n unittest.main()\n',
  'build.py': 'import py_compile\nfor name in ["calc.py", "display.py", "test_calc.py"]:\n py_compile.compile(name, doraise=True)\nprint("A2-BUILD-PASS")\n',
  'acceptance_check.py': 'import unittest\nimport calc, display, test_calc\nassert calc.add(2,3)==5\nassert calc.multiply(2,3)==6\nassert calc.multiply(-2,3)==-6\nassert display.format_product(2,3)=="6"\nassert display.format_product(-2,3)=="-6"\nsuite=unittest.defaultTestLoader.loadTestsFromModule(test_calc)\nassert suite.countTestCases()>=4\nprint("A2-FUNCTIONAL-CONTRACT-PASS")\n',
});
// ADR-0239 (F-01) characterisation corpus: evaluated by the package Policy engine only, never executed. Source: first impact analysis section 4.
const F01_WRAPPED = Object.freeze([
  'start npm publish', 'start /b npm publish', 'cmd /c start npm publish', 'start reg add HKCU\\x', 'cmd /c start reg add x', 'start icacls x /grant a:F',
  'xargs npm publish', 'nohup npm publish', 'time npm publish', 'npx npm publish', 'npm exec -- npm publish', 'conhost reg add x', 'wmic process call create "reg add x"'
]);
const F01_DATA = Object.freeze(['echo npm publish', 'rem npm publish', 'printf "reg add x"', 'echo reg add HKCU\\x']);
// Positive controls: the same engine must still ask for these, so "allow" above is not a trivial default.
const F01_CONTROLS = Object.freeze(['npm publish', 'git push origin main']);
// M1-06: an approval card for a command far above 200 characters. Spaced words let the card wrap; the command still ends in a push, so it needs approval.
// The product shows `shell cwd=<cwd>: <command>` only when the call names a cwd.
const LONG_CARD_COMMAND = 'cmd /c "echo ' + Array.from({ length: 60 }, (_, n) => 'segment' + n).join(' ') + ' & git push origin main"';
// A Python script that exits after printing, used as the managed output source of M2-03.
// Files are written as bytes: on Windows Path.write_text would turn '\n' into CRLF, and the Stage conditions compare exact LF bytes.
const SCRIPT_FILES = Object.freeze({
  'slow_build.py': "import time\nprint('A2-BUILD-START', flush=True)\nfor i in range(120):\n time.sleep(1)\n print('A2-BUILD-TICK', i, flush=True)\n",
  'bg_hold.py': "import time\nfor _ in range(180):\n time.sleep(1)\n",
  'bg_out.py': "import time\nfrom pathlib import Path\nprint('A2-MANAGED-OUT', flush=True)\nPath('bg_out.done').write_bytes(b'done\\n')\ntime.sleep(3)\n",
  // The Turn waits on this script, so a background effect is on disk before the product collects external changes (it collects only after a shell or start_process call):
  // `settle.py <file> [text|-] [grace_seconds]` returns once the file exists, is not empty and (with text) holds exactly that line; 20 s at most, exit 1 on timeout.
  'settle.py': "import sys\nimport time\nfrom pathlib import Path\nname = sys.argv[1]\ntext = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None\ngrace = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5\nfor _ in range(200):\n p = Path(name)\n if p.exists() and p.stat().st_size > 0 and (text is None or p.read_bytes().decode('utf-8').strip() == text):\n  time.sleep(grace)\n  print('A2-SETTLED', name, flush=True)\n  sys.exit(0)\n time.sleep(0.1)\nprint('A2-SETTLE-TIMEOUT', name, flush=True)\nsys.exit(1)\n",
  'ext_modify.py': "import sys\nfrom pathlib import Path\nPath(sys.argv[1]).write_bytes((sys.argv[2] + '\\n').encode('utf-8'))\nprint('A2-EXT-DONE', sys.argv[1])\n",
  'late_write.py': "import time\nfrom pathlib import Path\nfor _ in range(640):\n if Path('late.go').exists():\n  Path('late_target.txt').write_bytes('late2\\n'.encode('utf-8'))\n  break\n time.sleep(0.25)\n",
});
const DATA_FILES = Object.freeze({
  'ext_edit.txt': 'edit0\n', 'ext_shell.txt': 'shell0\n', 'ext_bg.txt': 'bg0\n', 'late_target.txt': 'late0\n', 'cont_target.txt': 'cont0\n',
});
// Delay before the fixture sends the final answer of a prompt, so the Turn is still active when the managed output frame is written; the Turn also waits on settle.py for it.
const FINAL_DELAY_MS = Object.freeze({ 'a2-audit-managed': 2500 });
function finalDelayMs(prompt) { return FINAL_DELAY_MS[prompt] || 0; }
// A continuation Turn sends `用户主动请求继续原任务...\n{JSON}\n不得重放...`; the fixture follows the original goal named in the JSON, not the wrapper.
function continuationGoal(prompt) {
  if (typeof prompt !== 'string' || !prompt.startsWith('用户主动请求继续原任务')) return null;
  const lines = prompt.split('\n');
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    try { const value = JSON.parse(line); return typeof value.originalGoal === 'string' ? value.originalGoal : null; } catch (_error) { return null; }
  }
  return null;
}
function toolsFor(prompt, shellKind, context = {}) {
  const prefix = prompt.split(':')[0];
  const write = (name, content) => ({ name: 'write', args: { path: name, content } });
  const read = (name) => ({ name: 'read', args: { path: name, encoding: 'utf-8' } });
  const edit = (name, oldText, newText) => ({ name: 'edit', args: { path: name, oldText, newText } });
  const shell = (cmd, extra = {}) => ({ name: 'shell', args: { command: cmd, ...extra } });
  const start = (cmd) => ({ name: 'start_process', args: { command: cmd } });
  const echoFile = (name, value) => shellKind === 'powershell'
    ? `[IO.File]::WriteAllText('${name}','${value}',(New-Object Text.UTF8Encoding($false)))`
    : `echo ${value}>${name}`;
  if (prefix === 'a2-git') {
    const index = Number(prompt.split(':')[1]);
    if (!Number.isInteger(index) || index < 0 || index >= GIT_FORMS.length) throw new Error('A9_36_GIT_FORM');
    return [{ name: index % 2 ? 'start_process' : 'shell', args: { command: GIT_FORMS[index] } }];
  }
  if (prompt.startsWith('a2-readonly:')) {
    const name = prompt.split(':')[1];
    const operations = { write: write('readonly.txt', 'forbidden'), shell: shell(echoFile('readonly-shell.txt', 'forbidden')), start_process: start(echoFile('readonly-start.txt', 'forbidden')) };
    if (!operations[name]) throw new Error('A9_36_READONLY_CASE');
    return [operations[name]];
  }
  if (prompt === 'a2-approve') return [shell('git reset --hard HEAD')];
  if (prompt.startsWith('a2-git-local:')) return [shell('git status --porcelain'), shell('git diff -- probe.txt'), shell('git add -- probe.txt'),
    shell('git -c user.name=A2 -c user.email=a2@example.invalid commit -m A2-local')];
  // M1-04: local branch listing, local branch switch (autonomous local writes), then an approved local commit on that branch.
  if (prefix === 'a2-git-branch') return [shell('git branch --show-current'), shell('git switch -c a2-topic'), shell('git add -- probe.txt'),
    shell('git -c user.name=A2 -c user.email=a2@example.invalid commit -m A2-topic')];
  // M1-05: a test-class command that ends, and a build-class command that is cancelled while it streams.
  if (prefix === 'a2-cmd-test') return [shell('python check.py')];
  if (prefix === 'a2-cmd-build') return [shell('python slow_build.py')];
  if (prefix === 'a2-long-card') return [shell(LONG_CARD_COMMAND, { cwd: context.workspace || '' })];
  if (prefix === 'a2-verify') {
    const n = Number(prompt.split(':')[1]); const command = 'python check.py';
    const sequence = [read('probe.txt'), edit('probe.txt', `value ${n - 1}`, `value ${n}`)];
    if (n === 1) sequence.push(shell(shellKind === 'powershell' ? 'Write-Output neutral' : 'echo neutral'));
    else sequence.push(shell(command));
    if (n === 3) sequence.push(edit('probe.txt', 'value 3', 'changed after validation'));
    if (n === 4) sequence.push(shell(command + ' --large-fail'));
    if (n === 5) sequence.push(start(echoFile('background-effect.txt', 'changed')));
    return sequence;
  }
  if (prompt === 'a2-review:1') return [read('probe.txt'), edit('probe.txt', 'value 0', 'value 1'), write('notes.md', 'created\n')];
  if (prompt === 'a2-review:2') return [read('a.txt'), edit('a.txt', 'a0', 'a1'), read('b.txt'), edit('b.txt', 'b0', 'b1')];
  if (prompt === 'a2-review:4') return [read('probe.txt'), edit('probe.txt', 'value 1', 'value 4')];
  if (prompt === 'a2-review:3') return [shell(echoFile('shell-effect.txt', 'shell-effect')), start(echoFile('start-effect.txt', 'start-effect')), shell('python settle.py start-effect.txt')];
  // M3-01: an edit plus a Shell that rewrites an EXISTING file; M3-03: start_process rewriting an existing file.
  if (prompt === 'a2-ext:shell') return [read('ext_edit.txt'), edit('ext_edit.txt', 'edit0', 'edit1'), shell('python ext_modify.py ext_shell.txt shell1')];
  if (prompt === 'a2-ext:bg') return [start('python ext_modify.py ext_bg.txt bg1'), shell('python settle.py ext_bg.txt bg1')];
  // M3-04: the Turn edits late_target.txt and starts a process that writes it again only after the driver creates late.go.
  if (prompt === 'a2-late:1') return [read('late_target.txt'), edit('late_target.txt', 'late0', 'late1'), start('python late_write.py')];
  // M3-02: the goal of an injected interrupted task; the continuation Turn edits a file and gets its own checkpoint.
  if (prompt === 'a2-cont-edit:1') return [read('cont_target.txt'), edit('cont_target.txt', 'cont0', 'cont1')];
  if (prompt.startsWith('a2-provider:') || prompt === 'a2-rules' || prompt === 'a2-context-retry') return [];
  if (prompt === 'a2-audit-start') return [read('probe.txt'), edit('probe.txt', 'value 0', 'changed'), write('never.txt', 'forbidden')];
  // M2-03: shell stream frame, managed stream frame and managed ownership event write failures; the second tool must never run.
  if (prompt === 'a2-audit-output') return [shell('python check.py'), write('never-output.txt', 'forbidden')];
  // The managed output frame fails in the background while the final answer is still held, so the Turn is active when the audit block aborts it.
  if (prompt === 'a2-audit-managed') return [start('python bg_out.py'), shell('python settle.py bg_out.done - 3')];
  if (prompt === 'a2-audit-ownership') return [start(echoFile('managed-effect.txt', 'changed')), write('never-ownership.txt', 'forbidden')];
  // M5 precondition rehearsal: a background process that is alive while Provider reconfiguration is attempted.
  if (prompt === 'a2-bg-hold') return [start('python bg_hold.py')];
  return null;
}
// Keys the driver may set through POST /state; anything else is a fixture input error.
const FIXTURE_STATE_KEYS = Object.freeze({ shellKind: (v) => ['cmd', 'powershell'].includes(v), workspace: (v) => typeof v === 'string' && v.length > 0 && v.length <= 260,
  providerFail: (v) => typeof v === 'boolean', contextRetried: (v) => typeof v === 'boolean' });
class SupplementFixture {
  constructor(logFile) { this.server = http.createServer((a, b) => this.handle(a, b)); this.beginStage(logFile); }
  // Counters, state and the request log restart with every Stage; the HTTP server and its port stay.
  beginStage(logFile) { this.logFile = logFile; this.state = { shellKind: 'cmd' }; this.requests = 0; this.toolMessages = 0; }
  listen() { return new Promise((resolve) => this.server.listen(0, '127.0.0.1', () => resolve(this.server.address().port))); }
  close() { return new Promise((resolve) => this.server.close(resolve)); }
  handle(req, res) {
    if (req.method === 'GET' && req.url === '/counters') { res.end(JSON.stringify({ requests: this.requests, tool_messages: this.toolMessages, held: 0, state: this.state })); return; }
    let body = ''; let tooLarge = false;
    req.on('data', (chunk) => { if (Buffer.byteLength(body) + chunk.length > 1048576) { tooLarge = true; req.destroy(); } else body += chunk.toString('utf8'); });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const parsed = JSON.parse(body || '{}');
        if (req.url === '/state') {
          for (const [key, value] of Object.entries(parsed)) if (!FIXTURE_STATE_KEYS[key] || !FIXTURE_STATE_KEYS[key](value)) throw new Error('state');
          this.state = { ...this.state, ...parsed }; res.end('{}'); return;
        }
        if (req.url !== '/v1/chat/completions') throw new Error('route');
        const messages = parsed.messages || []; const userIndex = messages.map((m) => m.role).lastIndexOf('user'); const rawPrompt = String(messages[userIndex]?.content || '');
        const goal = continuationGoal(rawPrompt); const prompt = goal || rawPrompt;
        const probe = (parsed.tools || []).some((t) => t.function?.name === 'probe_test_echo');
        const toolMessages = messages.slice(userIndex + 1).filter((m) => m.role === 'tool');
        if (!probe) { this.requests++; this.toolMessages = toolMessages.length; }
        const calls = messages.slice(userIndex + 1).flatMap((m) => m.role === 'assistant' && Array.isArray(m.tool_calls) ? m.tool_calls : []);
        const rejections = toolMessages.flatMap((m) => {
          const call = calls.find((c) => c.id === m.tool_call_id); const name = call?.function?.name;
          return ['write', 'shell', 'start_process'].includes(name) && typeof m.content === 'string'
            && m.content.startsWith(`Error: unknown or unavailable tool '${name}' in read_only mode. Available tools: `)
            ? [{ tool: name, call_id: call.id, kind: 'unavailable_read_only' }] : [];
        });
        const sequence = toolsFor(prompt, this.state.shellKind, this.state);
        const issued = sequence?.[toolMessages.length];
        const all = JSON.stringify(messages); const countText = (needle) => messages.filter((m) => String(m.content || '').includes(needle)).length;
        // The AGENTS.md on disk at request time, to bind the request construction to an input hash (M2-04).
        let agents = null;
        if (typeof this.state.workspace === 'string') { try { agents = fs.readFileSync(path.join(this.state.workspace, 'AGENTS.md'), 'utf8'); } catch (_error) { agents = null; } }
        const system = messages.find((m) => m.role === 'system');
        fs.appendFileSync(this.logFile, JSON.stringify({ request: this.requests, probe, prompt_sha256: contract.sha(prompt), prompt, continuation: goal !== null, tool_messages: toolMessages.length, issued_tool: issued?.name || null, rejections,
          rules: countText('A2-RULE-MARKER'), rule_markers: [...new Set(all.match(/A2-RULE-MARKER(?:-[A-Z]+)?/g) || [])].sort(), environment: countText('<environment_facts>'), chars: all.length,
          system_sha256: system ? contract.sha(typeof system.content === 'string' ? system.content : JSON.stringify(system.content)) : null,
          agents_sha256: agents === null ? null : contract.sha(agents), agents_in_request: agents === null ? null : all.includes(JSON.stringify(agents).slice(1, -1)) }) + '\n', 'utf8');
        if (!probe && this.state.providerFail === true) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'a2 injected provider failure' } })); return; }
        if (prompt === 'a2-context-retry' && !this.state.contextRetried) {
          this.state.contextRetried = true; res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'context_length_exceeded' } })); return;
        }
        const respond = () => {
          try {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            const send = (delta, finish = 'stop') => res.write('data: ' + JSON.stringify({ choices: [{ delta, ...(finish === 'missing' ? {} : { finish_reason: finish }) }] }) + '\n\n');
            const tool = (value, id, finish = 'tool_calls', bad = false) => send({ tool_calls: [{ index: 0, id, type: 'function', function: { name: value.name, arguments: bad ? '{"path":' : JSON.stringify(value.args) } }] }, finish);
            if (probe) tool({ name: 'probe_test_echo', args: { message: 'probe_ok' } }, 'probe');
            else if (prompt.startsWith('a2-provider:') && toolMessages.length === 0) {
              const finish = prompt.split(':')[1];
              if (finish !== 'empty') tool({ name: 'write', args: { path: 'provider-effect.txt', content: finish } }, 'provider-test', finish === 'invalid_json' ? 'tool_calls' : finish, finish === 'invalid_json');
            } else {
              if (sequence === null) throw new Error('unknown fixed prompt');
              if (issued) tool(issued, 'a2-' + contract.sha(prompt).slice(0, 8) + '-' + toolMessages.length);
              else send({ content: 'A2 fixture complete' });
            }
            res.end('data: [DONE]\n\n');
          } catch (error) { if (!res.headersSent) res.writeHead(400); res.end(JSON.stringify({ error: { message: 'A9_36_FIXTURE_INPUT' } })); }
        };
        // The delay comes before any byte of the final answer, so the Turn cannot end earlier.
        const delay = !probe && !issued ? finalDelayMs(prompt) : 0;
        if (delay > 0) setTimeout(respond, delay); else respond();
      } catch (error) { if (!res.headersSent) res.writeHead(400); res.end(JSON.stringify({ error: { message: 'A9_36_FIXTURE_INPUT' } })); }
    });
  }
}
// 'fixture' seeds the loopback-Provider workspace; 'journey' seeds the real-model project of M5.
function seedWorkspace(workspace, kind) {
  fs.mkdirSync(workspace); const put = (n, text) => fs.writeFileSync(path.join(workspace, n), text, { encoding: 'utf8', flag: 'wx' });
  if (kind === 'journey' || kind === 'm5') { for (const [name, text] of Object.entries(JOURNEY_FILES)) put(name, text); return; }
  if (kind !== 'fixture' && !['m1', 'm2', 'm3', 'm4'].includes(kind)) throw new Error('A9_36_SEED_KIND');
  put('AGENTS.md', '# A2-RULE-MARKER\nOnly change files in this isolated workspace.\n'); put('probe.txt', 'value 0\n'); put('check.py', TEST_SOURCE); put('a.txt', 'a0\n'); put('b.txt', 'b0\n');
  for (const [name, text] of Object.entries(SCRIPT_FILES)) put(name, text);
  for (const [name, text] of Object.entries(DATA_FILES)) put(name, text);
}
function isolatedProfileEnvironment(phaseRoot) {
  return { LOCALAPPDATA: path.join(phaseRoot, 'profile-local'), APPDATA: path.join(phaseRoot, 'profile-roaming'),
    TEMP: path.join(phaseRoot, 'temp'), TMP: path.join(phaseRoot, 'temp'), HOME: path.join(phaseRoot, 'profile-home'), WIN7AGENT_PORTABLE: '0',
    NODE_EXTRA_CA_CERTS: '', NODE_TLS_REJECT_UNAUTHORIZED: '1', SSL_CERT_FILE: '', SSL_CERT_DIR: '' };
}
function command(file, args, cwd, env) {
  const result = childProcess.spawnSync(file, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1048576, ...(env ? { env } : {}) });
  if (result.error || result.status !== 0) throw new Error('A9_36_SETUP_COMMAND_FAILED:' + path.basename(file));
  return result.stdout;
}
// Git reads GIT_DIR, GIT_WORK_TREE, GIT_CONFIG_* and similar variables from the environment, and the system and user configuration from the machine.
// Setup and the Stage driver get an environment without the inherited GIT_* variables (undefined values are dropped by spawn), with the system configuration off.
// With `home` (the isolated HOME of the Stage) the global configuration is an empty file there and XDG_CONFIG_HOME points into it, so neither ~/.gitconfig nor an inherited
// $XDG_CONFIG_HOME/git/config can bring hooks, templates, includes or URL rewrites.
function gitEnvironment(base = process.env, home = null) {
  const result = {};
  for (const name of Object.keys(base)) if (/^GIT_/i.test(name)) result[name] = undefined;
  result.GIT_CONFIG_NOSYSTEM = '1'; result.GIT_TERMINAL_PROMPT = '0';
  if (home) { result.HOME = home; result.XDG_CONFIG_HOME = path.join(home, 'xdg-config'); result.GIT_CONFIG_GLOBAL = path.join(home, 'gitconfig-empty'); }
  return result;
}
// M1-02: the workspace gets a real local bare `origin` holding refs/heads/main, so "zero execution" of the nineteen push forms is falsifiable at the Git layer.
// The local main is one commit ahead of origin/main: a push that really ran would move origin's ref, which the ref check would see. The remote is a local directory; no network address is configured.
function setupGitWorkspace(gitPath, workspace, origin, home) {
  if (home) { fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(path.join(home, 'gitconfig-empty'), '', { flag: 'a' }); }
  const env = { ...process.env, ...gitEnvironment(process.env, home) }; const git = (args, cwd) => command(gitPath, args, cwd, env);
  const identity = ['-c', 'user.name=A2', '-c', 'user.email=a2@example.invalid'];
  git(['init', '-b', 'main'], workspace); git(['add', '--', 'probe.txt'], workspace);
  git([...identity, 'commit', '-m', 'A2-baseline'], workspace);
  fs.mkdirSync(origin); git(['init', '--bare', '-b', 'main'], origin);
  git(['remote', 'add', 'origin', origin], workspace); git(['push', 'origin', 'main'], workspace);
  const main = git(['--git-dir', origin, 'rev-parse', 'refs/heads/main'], workspace).trim();
  const refs = git(['--git-dir', origin, 'for-each-ref', '--format=%(refname) %(objectname)'], workspace).trim();
  if (!/^[0-9a-f]{40}$/.test(main) || refs !== `refs/heads/main ${main}`) throw new Error('A9_36_ORIGIN_SETUP');
  git([...identity, 'commit', '--allow-empty', '-m', 'A2-unpushed'], workspace);
  const ahead = git(['rev-list', '--count', 'refs/remotes/origin/main..refs/heads/main'], workspace).trim();
  if (ahead !== '1' || git(['--git-dir', origin, 'rev-parse', 'refs/heads/main'], workspace).trim() !== main) throw new Error('A9_36_ORIGIN_AHEAD');
  return { A9_ALPHA2_ORIGIN: origin, A9_ALPHA2_ORIGIN_MAIN: main };
}
// M2-06 budget case: only the saved non-secret budget changes, between two Stage launches, exactly as the product's own config file carries it.
function setContextBudget(dataRoot, chars) {
  const file = path.join(dataRoot, 'a9-provider-config.v1.json'); const config = contract.readJson(file, 1048576);
  if (config.schemaVersion !== 1 || typeof config.baseUrl !== 'string' || !Number.isSafeInteger(chars) || chars < 16000 || chars > 1000000) throw new Error('A9_36_BUDGET_CONFIG');
  const before = config.contextBudgetChars === undefined ? null : config.contextBudgetChars;
  config.contextBudgetChars = chars; fs.writeFileSync(file, JSON.stringify(config), 'utf8');
  return { file: 'a9-provider-config.v1.json', before, after: chars };
}
function copyEncryptedConfig(source, destination, expected) {
  const configFile = path.join(source, 'a9-provider-config.v1.json'); const value = contract.readJson(configFile);
  const allowed = ['schemaVersion', 'baseUrl', 'model', 'customHeaderNames', 'contextBudgetChars', 'keyRemembered', 'probe', 'caBundle', 'proxy', 'updatedAt'];
  if (value.schemaVersion !== 1 || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('A9_36_SAVED_CONFIG_FIELDS');
  if (value.baseUrl.replace(/\/$/, '') !== expected.base_url || value.model !== expected.model || value.keyRemembered !== true || value.proxy || value.caBundle || (value.customHeaderNames || []).length) throw new Error('A9_36_SAVED_CONFIG_MISMATCH');
  // The product writes `updatedAt` on every save (a9-agent-runtime.js, configureProvider); it is validated here and not copied.
  if (value.updatedAt !== undefined && (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt)))) throw new Error('A9_36_SAVED_CONFIG_UPDATED_AT');
  if (value.contextBudgetChars !== undefined && (!Number.isSafeInteger(value.contextBudgetChars) || value.contextBudgetChars < 16000 || value.contextBudgetChars > 1000000)) throw new Error('A9_36_SAVED_CONFIG_BUDGET');
  const copied = [];
  // Construct only the supported non-secret fields. In particular never copy an arbitrary nested probe object.
  const configBytes = JSON.stringify({ schemaVersion: 1, baseUrl: expected.base_url, model: expected.model, keyRemembered: true, customHeaderNames: [],
    ...(value.contextBudgetChars !== undefined ? { contextBudgetChars: value.contextBudgetChars } : {}) }) + '\n';
  fs.writeFileSync(path.join(destination, 'a9-provider-config.v1.json'), configBytes, { flag: 'wx' }); copied.push('a9-provider-config.v1.json');
  for (const slot of ['a9-vault-apikey', 'a9-vault-secrets']) {
    const relative = path.join(slot, 'credentials', 'credentials.v1.json'); const file = path.join(source, relative);
    if (!fs.existsSync(file)) { if (slot === 'a9-vault-apikey') throw new Error('A9_36_SAVED_KEY_MISSING'); continue; }
    const encrypted = contract.readJson(file);
    contract.exact(encrypted, ['schemaVersion', 'protection', 'ciphertext']);
    if (encrypted.schemaVersion !== 1 || encrypted.protection !== 'electron-safe-storage-windows-dpapi-current-user' || typeof encrypted.ciphertext !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted.ciphertext)) throw new Error('A9_36_ENCRYPTED_RECORD');
    const target = path.join(destination, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL); copied.push(relative);
  }
  return { copied_names: copied, plaintext_credential_export: false, actual_dpapi_restore: 'NOT_PERFORMED' };
}
// Electron patches `fs` (node mode included): a path ending in .asar is an archive directory, not a file. The candidate trees hold
// resources/default_app.asar as a plain file, so the whole-tree check reads through original-fs. The first Win7 run of the check failed with
// A9_36_CANDIDATE_CHANGED without recording the entry; the asar mechanism makes this file the inferred cause, it was not located on the target.
// Same rule as the candidate's own selectPhysicalFileSystem: under Electron there is no fallback to the patched fs.
function rawFileSystem(runtimeVersions = process.versions, loadOriginalFs = () => require('original-fs')) {
  if (!runtimeVersions || !runtimeVersions.electron) return fs;
  let physical;
  try { physical = loadOriginalFs(); } catch (error) { throw new Error('A9_36_PHYSICAL_FILESYSTEM_UNAVAILABLE'); }
  for (const method of ['lstatSync', 'statSync', 'openSync', 'readSync', 'closeSync']) if (!physical || typeof physical[method] !== 'function') throw new Error('A9_36_PHYSICAL_FILESYSTEM_UNAVAILABLE');
  return physical;
}
function rawFileHash(io, file) {
  const fd = io.openSync(file, 'r'); const buffer = Buffer.alloc(1024 * 1024); const hash = crypto.createHash('sha256');
  try { let n; while ((n = io.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n)); }
  finally { io.closeSync(fd); }
  return hash.digest('hex');
}
// Every manifest entry must be a regular file, below the root, without links, with the recorded size and SHA-256. Used for the WIN7-46 candidate and the WIN7-42 rollback package.
function verifyManifestTree(root, manifest, io = rawFileSystem()) {
  if (!Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > 2000 || new Set(manifest.files.map((f) => f.path)).size !== manifest.files.length) throw new Error('A9_36_MANIFEST_SHAPE');
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.split('/').some((v) => !v || v === '.' || v === '..') || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) throw new Error('A9_36_MANIFEST_PATH');
    const file = contract.within(root, path.resolve(root, ...entry.path.split('/')));
    let current = root;
    for (const part of entry.path.split('/')) { current = path.join(current, part); if (io.lstatSync(current).isSymbolicLink()) throw new Error('A9_36_CANDIDATE_LINK'); }
    if (!io.statSync(file).isFile() || io.statSync(file).size !== entry.size || rawFileHash(io, file) !== entry.sha256) throw new Error('A9_36_CANDIDATE_CHANGED');
  }
  return manifest.files.length;
}
function inspectCandidate(a) {
  if (contract.fileHash(a.zip_path) !== a.package_sha256 || contract.fileHash(path.join(a.candidate_root, 'release-manifest.json')) !== a.manifest_sha256) throw new Error('A9_36_PACKAGE_IDENTITY');
  const manifest = contract.readJson(path.join(a.candidate_root, 'release-manifest.json'), 1048576); const mismatches = [];
  if (manifest.source_commit !== a.source || manifest.candidate !== a.candidate) throw new Error('A9_36_PACKAGE_IDENTITY');
  // Authenticate the whole tree before requiring any candidate JS or its imports.
  verifyManifestTree(a.candidate_root, manifest);
  const integrityFile = path.join(a.candidate_root, 'validation', 'a9-batch2-package-integrity.cjs');
  const entry = manifest.files.find((v) => v.path === 'validation/a9-batch2-package-integrity.cjs');
  if (!entry || contract.fileHash(integrityFile) !== entry.sha256) throw new Error('A9_36_INTEGRITY_LOADER_CHANGED');
  const integrity = require(integrityFile);
  const tree = integrity.verifyFullTree(a.candidate_root, manifest, require('original-fs'), mismatches);
  return { files: tree.filesChecked, mismatches };
}
// WMIC `get SessionId /value` prints exactly one `SessionId=<decimal>` line. A prefix match would accept 50 for 5, so the number is parsed whole.
function sessionIdOf(text) {
  const value = String(text);
  if ((value.match(/SessionId=/g) || []).length !== 1) return null;
  const found = /^[ \t]*SessionId=([0-9]{1,9})[ \t\r]*$/m.exec(value);
  return found ? Number(found[1]) : null;
}
function assertActualRuntime(a) {
  if (process.platform !== 'win32' || process.arch !== 'x64' || require('os').release() !== '6.1.7601' || process.versions.electron !== '22.3.27' || process.versions.node !== '16.17.1' || process.versions.modules !== '110') throw new Error('A9_36_RUNTIME');
  const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const sid = command(path.join(system, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh']);
  const groups = command(path.join(system, 'whoami.exe'), ['/groups', '/fo', 'csv', '/nh']);
  const self = command(path.join(system, 'wbem', 'WMIC.exe'), ['process', 'where', `ProcessId=${process.pid}`, 'get', 'SessionId', '/value']);
  if (!sid.includes('"' + a.target.sid + '"') || !groups.includes('S-1-16-8192') || /S-1-16-(12288|16384|4096)/.test(groups)
    || sessionIdOf(self) !== a.target.session_id || require('os').hostname().toUpperCase() !== a.target.machine.toUpperCase()) throw new Error('A9_36_EXECUTOR_IDENTITY');
  for (const name of ['python', 'git']) if (contract.fileHash(a.tools[name].path) !== a.tools[name].sha256) throw new Error('A9_36_TOOL_CHANGED');
  const python = command(a.tools.python.path, ['--version']); const git = command(a.tools.git.path, ['--version']);
  if (!/^Python 3\.8\./.test(python.trim()) || !/^git version 2\.46\.2/.test(git.trim())) throw new Error('A9_36_TOOL_VERSION');
  return { electron: process.versions.electron, node: process.versions.node, abi: process.versions.modules, python: python.trim(), git: git.trim() };
}
// Closed Stage plan. A Stage is one driver launch (one product start) with its own isolated roots; a Stage with `reuse` continues on the roots of an earlier
// Stage of the same phase (a product restart on the same data). Every assertion id is `<group>-A<nn>`; a phase passes only when every Stage passes.
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, n) => from + n);
const G_M2 = 'A2-M2-VERIFICATION';
const freezeStages = (list) => Object.freeze(list.map((stage) => Object.freeze({ ...stage, ids: Object.freeze(stage.ids.slice()) })));
const STAGE_PLAN = Object.freeze({
  m4: freezeStages([{ name: 'main', mode: 'supplement_continue_schema', group: 'A2-M4-CONTINUE-SCHEMA', ids: [1, 2, 3], seed: 'fixture' }]),
  m1: freezeStages([{ name: 'main', mode: 'supplement_policy_git', group: 'A2-M1-POLICY-GIT', ids: range(1, 11), seed: 'fixture', git: true }]),
  m2: freezeStages([
    { name: 'main', mode: 'supplement_verification', group: G_M2, ids: range(1, 6), seed: 'fixture' },
    { name: 'audit_output', mode: 'supplement_audit_output', group: G_M2, ids: [7], seed: 'fixture' },
    { name: 'audit_managed', mode: 'supplement_audit_managed', group: G_M2, ids: [8], seed: 'fixture' },
    { name: 'audit_ownership', mode: 'supplement_audit_ownership', group: G_M2, ids: [9], seed: 'fixture' },
    { name: 'continue', mode: 'supplement_continue', group: G_M2, ids: [10, 11], seed: 'fixture' },
    { name: 'budget', mode: 'supplement_budget', group: G_M2, ids: [12, 13], reuse: 'continue', budgetChars: 16000 },
  ]),
  m3: freezeStages([
    { name: 'main', mode: 'supplement_review', group: 'A2-M3-REVIEW', ids: range(1, 10), seed: 'fixture' },
    { name: 'restart', mode: 'supplement_review_restart', group: 'A2-M3-REVIEW', ids: [11], reuse: 'main' },
  ]),
  m5: freezeStages([
    { name: 'rehearsal', mode: 'supplement_provider_guard', group: 'A2-M5-JOURNEY', ids: [6], seed: 'fixture' },
    { name: 'main', mode: 'supplement_real_model', group: 'A2-M5-JOURNEY', ids: range(1, 5), seed: 'journey', credentials: true, timeoutMs: 1800000 },
  ]),
});
const M6_GROUP = 'A2-M6-PERSISTENCE';
const M6_ASSERTIONS = Object.freeze(range(1, 5).map((n) => `${M6_GROUP}-A${String(n).padStart(2, '0')}`));
const pad2 = (n) => String(n).padStart(2, '0');
function stageAssertionIds(stage) { return stage.ids.map((n) => `${stage.group}-A${pad2(n)}`); }
function requiredAssertions(phase) {
  if (phase === 'm6') return M6_ASSERTIONS.slice();
  const plan = STAGE_PLAN[phase]; if (!plan) throw new Error('A9_36_PHASE');
  return plan.flatMap(stageAssertionIds).sort();
}
function stageOf(phase, name) {
  const stage = (STAGE_PLAN[phase] || []).find((item) => item.name === name);
  if (!stage) throw new Error('A9_36_STAGE');
  return stage;
}
// A Stage passes only when the driver finished (DONE), reported exactly the Stage's assertions once each, all PASS, and exited normally.
function evaluateStageResult(stage, driver, exit) {
  const expected = stageAssertionIds(stage); const rows = driver && driver.assertions;
  return Boolean(driver && driver.mode === stage.mode && driver.status === 'DONE' && Array.isArray(rows) && rows.length === expected.length
    && new Set(rows.map((v) => v.assertion_id)).size === rows.length && expected.every((id) => rows.some((v) => v.assertion_id === id && v.status === 'PASS'))
    && exit && exit.code === 0 && !exit.killed_by && !exit.spawn_error);
}
// Kept for single-Stage callers: the first Stage of the phase unless a name is given.
function evaluateDriverResult(phase, driver, exit, name) {
  const stage = name ? stageOf(phase, name) : (STAGE_PLAN[phase] || [])[0];
  if (!stage) throw new Error('A9_36_PHASE');
  return evaluateStageResult(stage, driver, exit);
}
// Every planned Stage must have run and passed, in plan order; a missing, extra, reordered or failed Stage fails the phase.
function evaluatePhaseStages(phase, results) {
  const plan = STAGE_PLAN[phase]; if (!plan) throw new Error('A9_36_PHASE');
  return Array.isArray(results) && results.length === plan.length && plan.every((stage, n) => results[n] && results[n].name === stage.name && results[n].status === 'PASS') ? 'PASS' : 'FAIL';
}
function stageLayout(phaseRoot, stage) {
  const home = path.join(phaseRoot, stage.reuse || stage.name);
  return { home, workspace: path.join(home, '中文 workspace'), data: path.join(home, 'data'), env: isolatedProfileEnvironment(home) };
}
// Processes of one launch: its tree (by recorded parent links), anything running from the isolated roots or the candidate, and the helper by name.
function postflight(smoke, a, rootPids, imageRoots) {
  const listing = smoke.listProcesses(smoke.realExec);
  const roots = new Set(rootPids.filter((pid) => Number.isSafeInteger(pid)));
  for (let round = 0; round < listing.rows.length; round++) for (const p of listing.rows) if (roots.has(Number(p.ParentProcessId))) roots.add(Number(p.ProcessId));
  const prefixes = imageRoots.map((v) => v.toLowerCase());
  const related = []; const environment = [];
  for (const p of listing.rows) {
    const image = String(p.ImagePath || '').toLowerCase();
    if (Number(p.ProcessId) === process.pid || !(roots.has(Number(p.ProcessId)) || prefixes.some((prefix) => image.startsWith(prefix)) || /^spike02_helper\.exe$/i.test(p.Name))) continue;
    const row = { pid: Number(p.ProcessId), parent: Number(p.ParentProcessId), name: p.Name, session: Number(p.SessionId) };
    // ADR-0256/0258/0259: exact path and a non-command-line image source; no traversal/device/alternate-stream aliases or trailing characters.
    if (p.ImageSource !== 'command_line' && /^C:\\Program Files \(x86\)\\SogouInput\\(?:(?!\.{1,2}\\)[^\\/:*?"<>|\x00-\x1f]+\\)*SGTool\.exe(?![\s\S])/i.test(image)) environment.push({ ...row, image: String(p.ImagePath) });
    else related.push(row);
  }
  return { failed: listing.failed, related, environment };
}
const postflightClean = (value) => Boolean(value) && !value.failed && Array.isArray(value.related) && value.related.length === 0;
// Milliseconds left until the first of the two limits: the authority's expiry and the total wall-clock limit counted from the first request.
function windowLeft(a, startedMs, now = Date.now()) { return Math.min(Date.parse(a.expires_at) - now, startedMs + a.max_wall_seconds * 1000 - now); }
// A Stage never starts in a window that is used up, and never gets more than the window has left.
function stageTimeout(a, stage, startedMs, now = Date.now()) {
  const left = windowLeft(a, startedMs, now);
  if (!(left >= 1000)) throw new Error('A9_36_WINDOW_EXHAUSTED');
  return Math.min(stage.timeoutMs || 600000, left);
}
// A Junction or symbolic link below the run root would let a write land outside it. Before the first write to `target`, every existing component below `root` must be a real
// directory (not a link) that resolves inside the resolved root; the target itself is a directory (default) or a regular file (`leaf: 'file'`). Components that do not exist yet
// are created by us afterwards, inside the part already checked.
function assertPhysicallyInside(root, target, leaf = 'directory') {
  const realRoot = fs.realpathSync(root); const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('A9_36_PATH_OUTSIDE_RUN_ROOT');
  const inside = (p) => p.toLowerCase() === realRoot.toLowerCase() || p.toLowerCase().startsWith((realRoot + path.sep).toLowerCase());
  const parts = relative.split(path.sep); let current = root;
  for (let n = 0; n < parts.length; n++) {
    current = path.join(current, parts[n]); let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error && error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink() || !inside(fs.realpathSync(current))) throw new Error('A9_36_PATH_LINK');
    const wanted = n === parts.length - 1 && leaf === 'file' ? stat.isFile() : stat.isDirectory();
    if (!wanted) throw new Error('A9_36_PATH_NOT_DIRECTORY');
  }
}
async function runStage(a, request, smoke, ctx, stage) {
  const { phaseRoot, attempt, runtime, fixture, port, envPath } = ctx;
  const stageDir = path.join(attempt, stage.name);
  const layout = stageLayout(phaseRoot, stage);
  const result = { name: stage.name, mode: stage.mode, status: 'FAIL', started_at: new Date().toISOString() };
  let exit = null; let launchError = null; let launched = false; let startedMs = null;
  try {
    startedMs = contract.readJson(path.join(a.run_root, 'ledger', '1.json')).started_ms;
    stageTimeout(a, stage, startedMs);
    // Every directory the Stage writes into, the profile directories included, is checked before the first write; a reused Stage finds them already there.
    const gitConfigEmpty = path.join(layout.env.HOME, 'gitconfig-empty');
    for (const p of [stageDir, layout.home, layout.workspace, layout.data, path.join(phaseRoot, 'origin.git'), ...['LOCALAPPDATA', 'APPDATA', 'TEMP', 'HOME'].map((name) => layout.env[name])]) assertPhysicallyInside(a.run_root, p);
    assertPhysicallyInside(a.run_root, gitConfigEmpty, 'file');
    fs.mkdirSync(stageDir);
    if (stage.reuse) { for (const p of [layout.workspace, layout.data]) if (!fs.existsSync(p)) throw new Error('A9_36_STAGE_REUSE_MISSING'); }
    else {
      fs.mkdirSync(layout.home, { recursive: true }); seedWorkspace(layout.workspace, stage.seed); fs.mkdirSync(layout.data);
      for (const name of ['LOCALAPPDATA', 'APPDATA', 'TEMP', 'HOME']) fs.mkdirSync(layout.env[name]);
    }
    // The empty global Git configuration exists in every Stage's HOME (reuse Stages find it again).
    fs.writeFileSync(gitConfigEmpty, '', { flag: 'a' });
    if (fs.statSync(gitConfigEmpty).size !== 0) throw new Error('A9_36_GIT_CONFIG_NOT_EMPTY');
    const extra = stage.git ? setupGitWorkspace(a.tools.git.path, layout.workspace, path.join(phaseRoot, 'origin.git'), layout.env.HOME) : {};
    if (stage.git) result.origin = { main: extra.A9_ALPHA2_ORIGIN_MAIN };
    if (stage.credentials) result.saved_config_copy = copyEncryptedConfig(a.credential_source, layout.data, a.provider);
    if (stage.budgetChars) result.budget_config = setContextBudget(layout.data, stage.budgetChars);
    const logFile = path.join(stageDir, 'fixture-requests.jsonl'); fs.writeFileSync(logFile, '', { flag: 'wx' }); fixture.beginStage(logFile);
    const resultFile = path.join(stageDir, 'driver-result.json');
    // The setup took time: the launch gets what is left now, and nothing is launched into a used-up window.
    const launchTimeoutMs = stageTimeout(a, stage, startedMs);
    launched = true;
    try {
      exit = await smoke.launchDriver(runtime, { ...layout.env, ...gitEnvironment(process.env, layout.env.HOME), ...extra, A9_BATCH2_MODE: stage.mode, A9_ALPHA2_SUPPLEMENT_MODE: stage.mode, A9_BATCH2_ATTEMPT_DIR: stageDir, ...(stage.reuse ? { A9_ALPHA2_PRIOR_STAGE_DIR: path.join(attempt, stage.reuse) } : {}),
        A9_BATCH2_WORKSPACE: layout.workspace, A9_BATCH2_DATAROOT: layout.data, A9_BATCH2_DRIVER_RESULT: resultFile, A9_BATCH2_FIXTURE_URL: `http://127.0.0.1:${port}/v1`,
        A9_BATCH2_FIXTURE_CONTROL: `http://127.0.0.1:${port}`, A9_BATCH2_PROVIDER_LOG: logFile, A9_BATCH2_PRODUCT_MAIN: path.join(a.candidate_root, 'resources', 'app', 'product', 'main.js'),
        A9_BATCH2_CANDIDATE_ROOT: a.candidate_root, A9_BATCH2_SECRET_LITERAL: 'a2-fixture-only-not-a-credential', A9_ALPHA2_INPUT_MODULE: path.join(a.run_root, 'inputs', 'a9-alpha2-supplement.cjs'),
        A9_ALPHA2_PYTHON: a.tools.python.path, A9_ALPHA2_GIT: a.tools.git.path, A9_ALPHA2_PROVIDER: JSON.stringify(a.provider),
        WIN7AGENT_A9_DATAROOT: layout.data, WIN7AGENT_A9_ELECTRON_SQLITE: path.join(a.candidate_root, 'resources', 'native', 'storage'), PATH: envPath },
      { timeoutMs: launchTimeoutMs });
    } catch (error) { launchError = error; }
    result.exit = exit;
    // Residue is queried right after the launch, before the result file is read, and also when the launch itself was rejected: a timed-out or crashed launch has no result
    // file and still needs its residue facts. A failed query is recorded as unknown (`failed`), which is not clean.
    try { result.postflight = postflight(smoke, a, exit ? [exit.pid] : [], [phaseRoot + path.sep, a.candidate_root + path.sep]); }
    catch (error) { result.postflight = { failed: true, related: [], error: String(error.message || error).slice(0, 200) }; }
    if (launchError) throw launchError;
    const driver = contract.readJson(resultFile, 1048576);
    result.driver = { mode: driver.mode, status: driver.status, assertions: driver.assertions, evidence: driver.evidence };
    // A result produced after the authority expired or the total wall-clock limit ended is not a PASS, however clean it looks.
    result.window_left_ms = windowLeft(a, startedMs);
    result.status = evaluateStageResult(stage, driver, result.exit) && postflightClean(result.postflight) && result.window_left_ms > 0 ? 'PASS' : 'FAIL';
  } catch (error) {
    result.error = String(error.message || error).slice(0, 400);
    if (!launched) result.postflight = { not_launched: true };
  }
  result.ended_at = new Date().toISOString();
  return result;
}
async function runStages(a, request, smoke, output) {
  const attempt = path.join(a.run_root, 'evidence', request.phase);
  const phaseRoot = path.join(a.run_root, 'work', request.phase);
  assertPhysicallyInside(a.run_root, attempt); assertPhysicallyInside(a.run_root, phaseRoot); fs.mkdirSync(phaseRoot, { recursive: true });
  const runtime = smoke.prepareDriverRuntime(a.candidate_root, phaseRoot);
  fs.copyFileSync(path.join(a.run_root, 'inputs', 'a9-batch2-driver-entry.cjs'), path.join(runtime.appRoot, 'main.cjs'));
  const envPath = [path.dirname(a.tools.python.path), path.dirname(a.tools.git.path), process.env.PATH || ''].join(';');
  const fixture = new SupplementFixture(null); const port = await fixture.listen();
  output.stages = [];
  try {
    for (const stage of STAGE_PLAN[request.phase]) {
      const result = await runStage(a, request, smoke, { phaseRoot, attempt, runtime, fixture, port, envPath }, stage);
      output.stages.push(result);
      // A failed Stage stops its phase: later Stages are not started and the phase cannot pass.
      if (result.status !== 'PASS') break;
    }
  } finally { await fixture.close(); }
  output.assertions = output.stages.flatMap((s) => (s.driver && s.driver.assertions) || []);
  output.status = evaluatePhaseStages(request.phase, output.stages);
}
// ---- M6: WIN7-42 / candidate persistence cross-read (component level; no GUI, no helper, no real process) -------------------------------------------
// The fixtures and the baseline are produced on the developer machine from the two frozen packages' own a9-persistence.js; the target runs the same probe with
// the package's own electron.exe (ELECTRON_RUN_AS_NODE=1) and better-sqlite3, and the business part of each result is compared with the baseline.
const M6_WORKSPACE = '/workspace';
const M6_CONVERSATION = 'c';
const M6_OLD_EVENT_AT = '2025-01-01T00:00:00.000Z';
const M6_PINS = Object.freeze({
  persistence_path: 'resources/app/state/dist/a9-persistence.js', native_path: 'resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  w42_persistence_sha256: contract.W42_PERSISTENCE_SHA,
});
const M6_TARGET_ENV = Object.freeze({ node: '16.17.1', electron: '22.3.27', abi: '110', platform: 'win32', arch: 'x64' });
const M6_FIXTURES = Object.freeze([{ name: 'F42', writer: 'w42', native: false }, { name: 'FCandC', writer: 'cand', native: false }, { name: 'FCandN', writer: 'cand', native: true }]);
// Six readable cross-reads (S) and four truncated copies opened by both versions (X). The reader decides which package's persistence module opens the copy.
const M6_SCENARIOS = Object.freeze([
  { name: 'S1', fixture: 'F42', reader: 'w42', kind: 'normal' }, { name: 'S2', fixture: 'FCandC', reader: 'cand', kind: 'normal' }, { name: 'S3', fixture: 'F42', reader: 'cand', kind: 'normal' },
  { name: 'S4', fixture: 'FCandC', reader: 'w42', kind: 'normal' }, { name: 'S5', fixture: 'FCandN', reader: 'w42', kind: 'normal' }, { name: 'S6', fixture: 'FCandN', reader: 'cand', kind: 'normal' },
  { name: 'X1', fixture: 'C42', reader: 'w42', kind: 'corrupt' }, { name: 'X2', fixture: 'C42', reader: 'cand', kind: 'corrupt' },
  { name: 'X3', fixture: 'CCand', reader: 'w42', kind: 'corrupt' }, { name: 'X4', fixture: 'CCand', reader: 'cand', kind: 'corrupt' },
]);
const M6_CALL_LABELS = Object.freeze(['listConversations', 'getActiveConversationId', 'listConversationFacts', 'listConversationFactPage', 'hasConversationFacts', 'listInterruptions',
  'listRecentCheckpoints', 'getCheckpoint', 'listManagedProcesses', 'listSessionEvents', 'markInterruptionsOnRestart', 'enforceRetention', 'countEvents']);
const stable = (value) => { const text = JSON.stringify(value === undefined ? null : value); return text === undefined ? null : JSON.parse(text); };
// Key-sorted JSON, so equality does not depend on property order.
function canon(value) {
  if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canon(value[key])).join(',') + '}';
  return JSON.stringify(value === undefined ? null : value);
}
function m6Load(packageRoot, sqliteDir) {
  const Database = require(sqliteDir);
  const { A9PersistenceManager } = require(path.join(packageRoot, ...M6_PINS.persistence_path.split('/')));
  return { Database, Manager: A9PersistenceManager };
}
function m6Open(loaded, file, dataRoot) { return loaded.Manager.open({ databasePath: file, dataRoot, openDatabase: (p, o) => new loaded.Database(p, o) }); }
// Data both versions can write (the first event is aged so enforceRetention has something to purge).
function m6WriteCommon(m) {
  const WS = M6_WORKSPACE; const C = M6_CONVERSATION;
  // The second conversation is created first, so that conversation C stays the active one of the workspace.
  m.createConversation('c2', WS);
  m.createConversation(C, WS);
  m.upsertTask('task1', C, 'completed'); m.upsertTurn('t1', 'task1', C, 'completed'); m.upsertRun('r1', 't1', C, 'completed');
  m.recordModelEvent(C, null, 'conversation.request', { taskId: 'task1', requestPrompt: '中文 目标 one' });
  m.recordToolEvent(C, 't1', 'tool_start', { data: { callId: 'x1', toolName: 'shell', args: { command: 'echo ok' } } });
  m.recordToolEvent(C, 't1', 'tool_end', { data: { callId: 'x1', toolName: 'shell', result: 'ok' } });
  m.saveCheckpoint({ turnId: 't1', sessionId: C, payload: { verification: 'verified', externalChanges: [] } });
  m.recordManagedProcess({ handleId: 'h1', workspacePath: WS, pid: 111, command: 'node a.js', cwd: WS, startedAt: '2026-10-16T00:00:00Z', lastProbeStatus: 'exited', cleanupRequired: false });
  m.upsertTask('task2', C, 'interrupted'); m.upsertTurn('t2', 'task2', C, 'interrupted');
  m.recordModelEvent(C, null, 'conversation.request', { taskId: 'task2', requestPrompt: '中文 目标 two' });
  m.recordToolEvent(C, 't2', 'tool_start', { data: { callId: 'x2', toolName: 'edit', args: { path: 'a.txt' } } });
  // Work left active in the other conversation, so markInterruptionsOnRestart has facts to change.
  m.upsertTask('task9', 'c2', 'active'); m.upsertTurn('t9', 'task9', 'c2', 'active'); m.upsertRun('r9', 't9', 'c2', 'active');
  m.db.prepare('UPDATE a9_events SET created_at = ? WHERE id = (SELECT MIN(id) FROM a9_events)').run(M6_OLD_EVENT_AT);
}
// Candidate-only data: managed ownership, an unknown-lifecycle handle, a streamed output frame and a continuation Turn.
function m6WriteNative(m) {
  const WS = M6_WORKSPACE; const C = M6_CONVERSATION;
  m.recordManagedOwnership({ handleId: 'h2', workspacePath: WS, pid: 222, command: 'node b.js', cwd: WS, startedAt: '2026-10-16T00:01:00Z', lastProbeStatus: 'running', cleanupRequired: true },
    { schemaVersion: 1, owner: { workspace: WS, conversationId: C, taskId: 'task2', turnId: 't2', toolCallId: 'call2' }, requestId: 'req2', ownershipState: 'owned' });
  m.recordManagedProcess({ handleId: 'h3', workspacePath: WS, pid: 0, command: 'node c.js', cwd: WS, startedAt: '2026-10-16T00:02:00Z', lastProbeStatus: 'running_unknown', cleanupRequired: true });
  m.recordToolEvent(C, 't2', 'tool_output', { data: { schemaVersion: 1, conversationId: C, turnId: 't2', taskId: 'task2', toolCallId: 'call2', requestId: 'req2', toolName: 'start_process', stream: 'stdout', text: 'hello', outputSeq: 1, sourceSeqThrough: 0, rawBytesRead: 5, truncated: false } });
  const rec = m.getTaskRecovery(WS, C, 'task2');
  m.requestTaskContinuation(WS, { conversationId: C, taskId: 'task2', interruptedTurnId: 't2', recoveryRevision: rec.recoveryRevision }, 't3', 'continue prompt');
  m.recordModelEvent(C, 't3', 'conversation.request', { taskId: 'task2', requestPrompt: 'continue prompt', interruptedTurnId: 't2' });
  m.upsertTurn('t3', 'task2', C, 'interrupted', { schemaVersion: 1, continuation: { interruptedTurnId: 't2', recoveryRevision: rec.recoveryRevision }, result: 'result_unknown' });
  m.upsertTask('task2', C, 'interrupted'); m.upsertRun('run-t3', 't3', C, 'interrupted');
}
// The thirteen interface calls (eleven reads, two state changes) in a fixed order; the values keep their content, not only counts.
function m6Calls(m) {
  const rows = []; const WS = M6_WORKSPACE; const C = M6_CONVERSATION;
  const call = (label, fn) => { try { rows.push({ label, ok: true, value: stable(fn()) }); } catch (error) { rows.push({ label, ok: false, error: String(error && error.message || error).slice(0, 200) }); } };
  call('listConversations', () => m.listConversations(WS));
  call('getActiveConversationId', () => m.getActiveConversationId(WS));
  call('listConversationFacts', () => m.listConversationFacts(C));
  call('listConversationFactPage', () => m.listConversationFactPage(C, { limit: 50 }));
  call('hasConversationFacts', () => m.hasConversationFacts(C));
  // All conversations: opening the file already turned the active work of c2 into interrupted facts.
  call('listInterruptions', () => m.listInterruptions());
  call('listRecentCheckpoints', () => m.listRecentCheckpoints(C, 50));
  call('getCheckpoint', () => m.getCheckpoint('t1'));
  call('listManagedProcesses', () => m.listManagedProcesses(WS).map((p) => ({ ...p, ownership: typeof m.getManagedOwnership === 'function' ? (m.getManagedOwnership(p.handleId) || null) : 'NOT_AVAILABLE_IN_THIS_VERSION' })));
  call('listSessionEvents', () => m.listSessionEvents(C, { limit: 1000 }));
  call('markInterruptionsOnRestart', () => m.markInterruptionsOnRestart());
  call('enforceRetention', () => m.enforceRetention(new Date(contract.M6_NOW)));
  call('countEvents', () => m.countEvents());
  return rows;
}
function m6ScenarioByName(name) {
  const scenario = M6_SCENARIOS.find((v) => v.name === name);
  if (!scenario) throw new Error('A9_36_M6_SCENARIO');
  return scenario;
}
// One scenario in this process. `env` (runtime facts, paths, timing, error texts) is recorded and only checked against the target runtime; `business` is compared field by field.
function m6Probe(scenarioName, packageRoot, sqliteDir, fixtureCopy, started = Date.now()) {
  const scenario = m6ScenarioByName(scenarioName);
  for (const value of [packageRoot, sqliteDir, fixtureCopy]) if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('A9_36_M6_PATH');
  const dataRoot = path.dirname(fixtureCopy); const loaded = m6Load(packageRoot, sqliteDir);
  const env = { node: process.versions.node, electron: process.versions.electron || null, abi: process.versions.modules, platform: process.platform, arch: process.arch };
  let business;
  if (scenario.kind === 'normal') {
    const opened = m6Open(loaded, fixtureCopy, dataRoot);
    if (opened.status !== 'ready' || !opened.manager) { business = { open_status: String(opened.status), has_manager: Boolean(opened.manager), calls: [] }; env.open_error = String(opened.error || '').slice(0, 200); }
    else { try { business = { open_status: 'ready', has_manager: true, calls: m6Calls(opened.manager) }; } finally { opened.manager.db.close(); } }
  } else {
    const hashOrMissing = (file) => (fs.existsSync(file) ? contract.fileHash(file) : 'MISSING');
    const before = hashOrMissing(fixtureCopy); let opened = null; let thrown = null;
    try { opened = m6Open(loaded, fixtureCopy, dataRoot); } catch (error) { thrown = String(error && error.message || error).slice(0, 200); }
    if (opened && opened.manager) { try { opened.manager.db.close(); } catch (_error) { /* recorded by the unexpected-manager check */ } }
    const after = hashOrMissing(fixtureCopy);
    business = { open_status: thrown ? 'THROW' : String(opened.status), has_manager: Boolean(opened && opened.manager), main_sha256_before: before, main_sha256_after: after, main_unchanged: before === after };
    env.open_error = thrown || String(opened.error || '').slice(0, 200); env.dir_listing = fs.readdirSync(dataRoot).sort();
  }
  env.elapsed_ms = Date.now() - started;
  return { schema_version: 1, scenario: scenario.name, fixture: scenario.fixture, reader: scenario.reader, kind: scenario.kind, env, business };
}
// Developer machine: write F42/FCandC/FCandN with the owning package's persistence module and cut C42/CCand from F42/FCandN at half their length.
function m6Fixtures(outDir, w42Root, candRoot, sqliteDir) {
  fs.mkdirSync(outDir); const roots = { w42: w42Root, cand: candRoot }; const files = {};
  const record = (name) => { const file = path.join(outDir, name); files[name] = { size: fs.statSync(file).size, sha256: contract.fileHash(file) }; };
  for (const fixture of M6_FIXTURES) {
    const loaded = m6Load(roots[fixture.writer], sqliteDir); const work = fs.mkdtempSync(path.join(os.tmpdir(), 'a9m6-')); const db = path.join(work, 'a9.sqlite');
    try {
      const opened = m6Open(loaded, db, work); if (opened.status !== 'ready') throw new Error('A9_36_M6_FIXTURE_OPEN');
      try { m6WriteCommon(opened.manager); if (fixture.native) m6WriteNative(opened.manager); opened.manager.db.pragma('wal_checkpoint(TRUNCATE)'); } finally { opened.manager.db.close(); }
      for (const side of ['-wal', '-shm']) if (fs.existsSync(db + side) && fs.statSync(db + side).size > 0) throw new Error('A9_36_M6_FIXTURE_SIDECAR');
      fs.copyFileSync(db, path.join(outDir, fixture.name + '.sqlite'), fs.constants.COPYFILE_EXCL);
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
    record(fixture.name + '.sqlite');
  }
  for (const [name, source] of [['C42', 'F42'], ['CCand', 'FCandN']]) {
    const bytes = fs.readFileSync(path.join(outDir, source + '.sqlite'));
    fs.writeFileSync(path.join(outDir, name + '.sqlite'), bytes.subarray(0, Math.floor(bytes.length / 2)), { flag: 'wx' }); record(name + '.sqlite');
  }
  return { files, persistence: { w42: contract.fileHash(path.join(w42Root, ...M6_PINS.persistence_path.split('/'))), cand: contract.fileHash(path.join(candRoot, ...M6_PINS.persistence_path.split('/'))) } };
}
// Developer machine: run all ten scenarios twice on copies of the fixtures; the two rounds must agree, then pin the business parts as the baseline.
function m6Baseline(fixturesDir, w42Root, candRoot, sqliteDir) {
  const roots = { w42: w42Root, cand: candRoot }; const rounds = [];
  for (let round = 0; round < 2; round++) {
    const scenarios = {};
    for (const scenario of M6_SCENARIOS) {
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'a9m6b-')); const copy = path.join(work, 'a9.sqlite');
      try { fs.copyFileSync(path.join(fixturesDir, scenario.fixture + '.sqlite'), copy); scenarios[scenario.name] = m6Probe(scenario.name, roots[scenario.reader], sqliteDir, copy).business; }
      finally { fs.rmSync(work, { recursive: true, force: true }); }
    }
    rounds.push(scenarios);
  }
  if (canon(rounds[0]) !== canon(rounds[1])) throw new Error('A9_36_M6_BASELINE_NOT_DETERMINISTIC');
  const fixtures = {}; for (const name of M6_FIXTURE_FILES_ORDER) fixtures[name] = contract.fileHash(path.join(fixturesDir, name + '.sqlite'));
  const baseline = { schema_version: 1, generator: 'm6-baseline', now: contract.M6_NOW, dev_node: process.version, fixtures,
    persistence: { w42: contract.fileHash(path.join(w42Root, ...M6_PINS.persistence_path.split('/'))), cand: contract.fileHash(path.join(candRoot, ...M6_PINS.persistence_path.split('/'))) }, scenarios: rounds[0] };
  contract.writeNew(path.join(fixturesDir, 'baseline.json'), baseline);
  return Object.fromEntries(contract.M6_FIXTURE_FILES.map((name) => [name, contract.fileHash(path.join(fixturesDir, name))]));
}
const M6_FIXTURE_FILES_ORDER = Object.freeze(['F42', 'FCandC', 'FCandN', 'C42', 'CCand']);
// R-1 (handle h2's cleanupRequired) and R-2 (the goal text of the continued task) as read in S5.
function m6Observations(business) {
  const calls = (business && Array.isArray(business.calls)) ? business.calls : [];
  const find = (label) => calls.find((c) => c.label === label && c.ok === true);
  const handles = find('listManagedProcesses'); const facts = find('listConversationFacts');
  const h2 = handles && Array.isArray(handles.value) ? handles.value.find((p) => p.handleId === 'h2') : undefined;
  const task2 = facts && Array.isArray(facts.value) ? facts.value.find((f) => f.taskId === 'task2') : undefined;
  return { r1_cleanup_required: h2 ? h2.cleanupRequired : undefined, r2_request_prompt: task2 ? task2.requestPrompt : undefined };
}
// Pure verdict over the ten target results and the pinned baseline. `pins` carries the identity checks runM6 made (fixtures unchanged, package trees, module and native hashes).
function evaluateM6(results, baseline, options = {}) {
  const expectedEnv = options.expectedEnv || M6_TARGET_ENV; const pins = options.pins || {};
  const have = (name) => (results && results[name]) || null;
  const base = (name) => (baseline && baseline.scenarios && baseline.scenarios[name]) || null;
  const rows = [];
  const row = (n, ok, facts) => rows.push({ case_id: M6_GROUP, assertion_id: `${M6_GROUP}-A${pad2(n)}`, status: ok === true ? 'PASS' : 'FAIL', observed: JSON.stringify(facts).slice(0, 1800) });
  const normal = M6_SCENARIOS.filter((s) => s.kind === 'normal'); const corrupt = M6_SCENARIOS.filter((s) => s.kind === 'corrupt');
  const opened = normal.map((s) => { const b = have(s.name) && have(s.name).business; const calls = b && Array.isArray(b.calls) ? b.calls : [];
    return { scenario: s.name, ready: Boolean(b) && b.open_status === 'ready', calls: calls.length, labels_in_order: calls.map((c) => c.label).join('|') === M6_CALL_LABELS.join('|'), failed: calls.filter((c) => !c.ok).map((c) => c.label) }; });
  row(1, opened.every((x) => x.ready && x.calls === 13 && x.labels_in_order && x.failed.length === 0), { scenarios: opened, total_calls: opened.reduce((sum, x) => sum + x.calls, 0) });
  const same = normal.map((s) => ({ scenario: s.name, equal: Boolean(have(s.name)) && Boolean(base(s.name)) && canon(have(s.name).business) === canon(base(s.name)) }));
  row(2, same.every((x) => x.equal), { scenarios: same });
  const damaged = corrupt.map((s) => { const b = have(s.name) && have(s.name).business;
    return { scenario: s.name, diagnostics: Boolean(b) && b.open_status === 'diagnostics', no_manager: Boolean(b) && b.has_manager === false,
      main_unchanged: Boolean(b) && b.main_unchanged === true && b.main_sha256_before === b.main_sha256_after, equal: Boolean(b) && Boolean(base(s.name)) && canon(b) === canon(base(s.name)) }; });
  row(3, damaged.every((x) => x.diagnostics && x.no_manager && x.main_unchanged && x.equal), { scenarios: damaged });
  const envs = M6_SCENARIOS.map((s) => { const e = have(s.name) && have(s.name).env; return { scenario: s.name, runtime_matches: Boolean(e) && Object.keys(expectedEnv).every((key) => e[key] === expectedEnv[key]) }; });
  row(4, envs.every((x) => x.runtime_matches) && pins.fixtures_unchanged === true && pins.packages_verified === true && pins.persistence === true && pins.native === true, { runtime: envs, pins });
  const target = m6Observations(have('S5') && have('S5').business); const reference = m6Observations(base('S5'));
  row(5, target.r1_cleanup_required !== undefined && target.r2_request_prompt !== undefined && canon(target) === canon(reference), { target, baseline: reference });
  return { ok: rows.length === 5 && rows.every((v) => v.status === 'PASS'), rows };
}
// The baseline file names what it was made from: the fixed clock, the hashes of the five fixtures and of the two persistence modules. A baseline made from other inputs is refused before any probe runs.
function validateM6Baseline(baseline, fixtureFiles, m6) {
  const b = baseline && typeof baseline === 'object' ? baseline : {}; const fixtures = b.fixtures && typeof b.fixtures === 'object' ? b.fixtures : {}; const persistence = b.persistence && typeof b.persistence === 'object' ? b.persistence : {};
  const scenarios = b.scenarios && typeof b.scenarios === 'object' ? b.scenarios : {}; const files = fixtureFiles && typeof fixtureFiles === 'object' ? fixtureFiles : {};
  const checks = {
    schema: b.schema_version === 1 && b.generator === 'm6-baseline',
    clock: b.now === contract.M6_NOW,
    fixtures: JSON.stringify(Object.keys(fixtures).sort()) === JSON.stringify(M6_FIXTURE_FILES_ORDER.slice().sort()) && M6_FIXTURE_FILES_ORDER.every((name) => /^[a-f0-9]{64}$/.test(fixtures[name] || '') && fixtures[name] === files[name + '.sqlite']),
    persistence: Boolean(m6) && m6.w42_persistence_sha256 === M6_PINS.w42_persistence_sha256 && contract.identityHash(m6.cand_persistence_sha256) && persistence.w42 === m6.w42_persistence_sha256 && persistence.cand === m6.cand_persistence_sha256,
    scenarios: JSON.stringify(Object.keys(scenarios).sort()) === JSON.stringify(M6_SCENARIOS.map((x) => x.name).sort()),
  };
  return { ok: Object.values(checks).every((v) => v === true), checks };
}
function runProbe(a, scenario, work, probeDir, roots, timeoutMs) {
  const readerRoot = roots[scenario.reader]; const dir = path.join(work, scenario.name); fs.mkdirSync(dir);
  const copy = path.join(dir, 'a9.sqlite'); fs.copyFileSync(path.join(roots.fixtures, scenario.fixture + '.sqlite'), copy, fs.constants.COPYFILE_EXCL);
  const profile = isolatedProfileEnvironment(dir); for (const name of ['LOCALAPPDATA', 'APPDATA', 'TEMP']) fs.mkdirSync(profile[name]);
  const outFile = path.join(probeDir, scenario.name + '.json');
  const sqliteDir = path.join(readerRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3');
  const child = childProcess.spawnSync(path.join(readerRoot, 'electron.exe'), [path.join(a.run_root, 'inputs', 'a9-alpha2-supplement.cjs'), '--m6-probe', scenario.name, readerRoot, sqliteDir, copy, outFile],
    { env: { ...process.env, ...profile, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' }, encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer: 1048576 });
  const exit = { code: child.status, signal: child.signal || null, error: child.error ? String(child.error.message || child.error).slice(0, 200) : null, pid: child.pid, stdout: String(child.stdout || '').slice(0, 2000), stderr: String(child.stderr || '').slice(0, 2000) };
  let result = null; let readError = null;
  try { result = contract.readJson(outFile, 1048576); } catch (error) { readError = String(error.message || error).slice(0, 200); }
  return { scenario: scenario.name, exit, result, read_error: readError };
}
// Each probe gets the least of its own 90 s, the time left until the authority expires and the time left of the total wall-clock limit (counted from the first request).
function m6ProbeTimeout(a, startedMs, now = Date.now()) { return Math.min(90000, windowLeft(a, startedMs, now)); }
async function runM6(a, request, smoke, output) {
  const m = a.m6; const attempt = path.join(a.run_root, 'evidence', 'm6'); const work = path.join(a.run_root, 'work', 'm6'); const probeDir = path.join(attempt, 'probes');
  for (const p of [work, probeDir]) assertPhysicallyInside(a.run_root, p);
  fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(probeDir, { recursive: true });
  // The rollback package: the ZIP, the manifest and every manifest file are authenticated before any of its code runs.
  if (contract.fileHash(m.w42_zip_path) !== m.w42_zip_sha256) throw new Error('A9_36_M6_W42_ZIP');
  const w42ManifestFile = path.join(m.w42_root, 'release-manifest.json');
  if (contract.fileHash(w42ManifestFile) !== m.w42_manifest_sha256) throw new Error('A9_36_M6_W42_MANIFEST');
  const w42Manifest = contract.readJson(w42ManifestFile, 1048576);
  if (w42Manifest.source_commit !== m.w42_source) throw new Error('A9_36_M6_W42_SOURCE');
  output.m6_packages = { w42_files: verifyManifestTree(m.w42_root, w42Manifest) };
  const inRoot = (root, relative) => contract.fileHash(path.join(root, ...relative.split('/')));
  const pins = { fixtures_unchanged: false, packages_verified: inRoot(m.w42_root, 'electron.exe') === a.runtime_sha256 && inRoot(a.candidate_root, 'electron.exe') === a.runtime_sha256,
    persistence: inRoot(m.w42_root, M6_PINS.persistence_path) === m.w42_persistence_sha256 && inRoot(a.candidate_root, M6_PINS.persistence_path) === m.cand_persistence_sha256,
    native: inRoot(m.w42_root, M6_PINS.native_path) === m.native_sha256 && inRoot(a.candidate_root, M6_PINS.native_path) === m.native_sha256 };
  if (!pins.packages_verified || !pins.persistence || !pins.native) throw new Error('A9_36_M6_MODULE_BINDING');
  const fixtureHashes = () => Object.fromEntries(contract.M6_FIXTURE_FILES.map((name) => [name, contract.fileHash(path.join(m.fixtures_root, name))]));
  const before = fixtureHashes();
  for (const name of contract.M6_FIXTURE_FILES) if (before[name] !== m.fixture_files[name]) throw new Error('A9_36_M6_FIXTURE_HASH');
  const baseline = contract.readJson(path.join(m.fixtures_root, 'baseline.json'), 4194304);
  const baselineBinding = validateM6Baseline(baseline, m.fixture_files, m); if (!baselineBinding.ok) throw new Error('A9_36_M6_BASELINE_BINDING');
  const roots = { w42: m.w42_root, cand: a.candidate_root, fixtures: m.fixtures_root };
  const probes = []; const results = {}; const startedMs = contract.readJson(path.join(a.run_root, 'ledger', '1.json')).started_ms; let deadlineExceeded = false; let loopError = null;
  try {
    for (const scenario of M6_SCENARIOS) {
      const timeoutMs = m6ProbeTimeout(a, startedMs);
      if (!(timeoutMs >= 1000)) { deadlineExceeded = true; break; }
      const probe = runProbe(a, scenario, work, probeDir, roots, timeoutMs); probes.push({ scenario: probe.scenario, exit: probe.exit, read_error: probe.read_error });
      if (probe.exit.code !== 0 || probe.exit.signal || probe.exit.error || !probe.result) break;
      results[scenario.name] = probe.result;
    }
  } catch (error) { loopError = error; }
  pins.fixtures_unchanged = canon(fixtureHashes()) === canon(before);
  output.m6 = { probes, baseline_sha256: before['baseline.json'], baseline_binding: baselineBinding.checks, pins, deadline_exceeded: deadlineExceeded };
  const verdict = evaluateM6(results, baseline, { pins }); output.assertions = verdict.rows;
  // The residue query also runs after a probe step threw. It is the last step before the verdict, so the deadline is judged after it: a group that ended past the authority's
  // expiry or the total wall-clock limit is not a PASS.
  try { output.postflight = postflight(smoke, a, probes.map((p) => p.exit.pid), [m.w42_root + path.sep, a.candidate_root + path.sep, work + path.sep]); }
  catch (error) { output.postflight = { failed: true, related: [], error: String(error.message || error).slice(0, 200) }; }
  if (windowLeft(a, startedMs) <= 0) deadlineExceeded = true;
  output.m6.deadline_exceeded = deadlineExceeded;
  if (loopError) throw loopError;
  output.status = verdict.ok && !deadlineExceeded && probes.length === M6_SCENARIOS.length && probes.every((p) => p.exit.code === 0 && !p.exit.signal && !p.exit.error) && postflightClean(output.postflight) ? 'PASS' : 'FAIL';
}
async function run(a, request) {
  const attempt = path.join(a.run_root, 'evidence', request.phase); assertPhysicallyInside(a.run_root, attempt); fs.mkdirSync(attempt, { recursive: true });
  const output = { schema_version: 1, task: 'A9-36', run_id: a.run_id, phase: request.phase, source: a.source, package_sha256: a.package_sha256, evidence_layer: 'WIN7_CURRENT_PACKAGE', status: 'FAIL', started_at: new Date().toISOString() };
  try {
    output.integrity = inspectCandidate(a); output.runtime = assertActualRuntime(a);
    const smoke = require(path.join(a.candidate_root, 'validation', 'a9-batch2-smoke.cjs'));
    if (request.phase === 'm6') await runM6(a, request, smoke, output);
    else await runStages(a, request, smoke, output);
  } catch (error) { output.error = String(error.message || error).slice(0, 400); }
  output.ended_at = new Date().toISOString(); return output;
}
function issueRequest(a, phase, pin, now = Date.now()) {
  const request = contract.createRequest(a, phase, pin, now); const dir = path.join(a.run_root, 'requests');
  contract.assertNext(request, a, path.join(a.run_root, 'ledger'), pin, now);
  fs.mkdirSync(dir, { recursive: true }); const requestFile = path.join(dir, phase + '.json'); contract.writeNew(requestFile, request);
  return requestFile;
}
async function main(argv = process.argv.slice(2)) {
  // Probe run by the target package's own electron.exe (ELECTRON_RUN_AS_NODE=1): no authority, writes one new JSON file and nothing else.
  if (argv[0] === '--m6-probe') {
    if (argv.length !== 6) throw new Error('A9_36_ARGUMENTS');
    const [, scenario, packageRoot, sqliteDir, copy, outFile] = argv;
    contract.writeNew(outFile, m6Probe(scenario, packageRoot, sqliteDir, copy)); return;
  }
  // Developer-machine producers of the pinned M6 inputs; they create a new directory and refuse to overwrite.
  if (argv[0] === '--m6-fixtures') {
    if (argv.length !== 5) throw new Error('A9_36_ARGUMENTS');
    process.stdout.write(JSON.stringify(m6Fixtures(argv[1], argv[2], argv[3], argv[4]), null, 2) + '\n'); return;
  }
  if (argv[0] === '--m6-baseline') {
    if (argv.length !== 5) throw new Error('A9_36_ARGUMENTS');
    process.stdout.write(JSON.stringify(m6Baseline(argv[1], argv[2], argv[3], argv[4]), null, 2) + '\n'); return;
  }
  if (argv[0] === '--issue') {
    if (argv.length !== 5) throw new Error('A9_36_ARGUMENTS');
    const [, authorityFile, pin, identityFile, phase] = argv;
    const a = contract.loadBound(authorityFile, pin, contract.readJson(identityFile));
    const requestFile = issueRequest(a, phase, pin);
    process.stdout.write(requestFile + '\n'); return;
  }
  if (argv.length !== 6 || argv[0] !== '--run') throw new Error('A9_36_ARGUMENTS');
  const [, authorityFile, pin, requestFile, identityFile, phase] = argv;
  const identity = contract.readJson(identityFile); const a = contract.loadBound(authorityFile, pin, identity);
  const request = contract.readJson(requestFile); if (request.phase !== phase) throw new Error('A9_36_PHASE_BINDING');
  contract.consume(request, a, path.join(a.run_root, 'ledger'), pin);
  const result = await run(a, request); contract.complete(request, a, result);
  process.stdout.write(JSON.stringify({ task: 'A9-36', phase, status: result.status }) + '\n'); process.exitCode = result.status === 'PASS' ? 0 : 1;
}
module.exports = { GIT_FORMS, TEST_SOURCE, JOURNEY_FILES, F01_WRAPPED, F01_DATA, F01_CONTROLS, LONG_CARD_COMMAND, SCRIPT_FILES, DATA_FILES, FINAL_DELAY_MS, finalDelayMs, continuationGoal,
  toolsFor, SupplementFixture, seedWorkspace, isolatedProfileEnvironment, gitEnvironment, setupGitWorkspace, setContextBudget, copyEncryptedConfig, verifyManifestTree, rawFileSystem, inspectCandidate, sessionIdOf, assertActualRuntime,
  STAGE_PLAN, M6_GROUP, M6_ASSERTIONS, stageAssertionIds, requiredAssertions, stageOf, evaluateStageResult, evaluateDriverResult, evaluatePhaseStages, stageLayout, postflightClean,
  M6_PINS, M6_SCENARIOS, M6_CALL_LABELS, canon, m6Calls, m6Probe, m6Fixtures, m6Baseline, m6Observations, evaluateM6, validateM6Baseline, m6ProbeTimeout, windowLeft, stageTimeout, assertPhysicallyInside, runStage, issueRequest, run, main };
if (require.main === module) main().catch((error) => { process.stderr.write(String(error.message || error).slice(0, 400) + '\n'); process.exitCode = 1; });
