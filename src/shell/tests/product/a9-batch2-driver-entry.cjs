'use strict';

/**
 * A9-33 batch2 product driver (WIN7-43 tentative, ADR-0155 Proposed).
 *
 * Runs inside the candidate's own electron.exe (copied to a candidate-external driver runtime by a9-batch2-smoke.cjs)
 * and requires the real product main.js before app ready. It drives the real workbench window through the real
 * preload and IPC: select workspace, set mode, configure a loopback Provider, submit turns, read the DOM, SQLite and
 * Provider counters, click Stop and Continue. It never calls runtime internals and never mocks product behavior.
 * The only replaced seams are dialog.showOpenDialog (workspace choice) and a pass-through recorder around
 * dialog.showMessageBox (the real exit dialog stays visible and is answered by the desktop controller).
 *
 * One process = one mode (A9_BATCH2_MODE). Every assertion is derived from observed facts. A fact the driver cannot
 * observe is reported as NOT_PERFORMED or UNKNOWN with the reason, never as PASS. A product DOM or API that differs
 * from what this driver reads ends the mode with an ERROR that names the step; nothing is guessed.
 * Pure evaluators are exported and load without Electron (dev-machine contract tests).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const childProcess = require('child_process');

// ---- Pure evaluators (no Electron) ---------------------------------------------------------------------------

function pad(n) { return String(n).padStart(2, '0'); }
function assertionId(caseId, n) { return `${caseId}-A${pad(n)}`; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function eventData(event) {
  const payload = event && event.payload && typeof event.payload === 'object' ? event.payload : {};
  return payload.data && typeof payload.data === 'object' ? payload.data : payload;
}
function framesFromEvents(events) {
  return (events || []).filter((event) => event.eventType === 'tool_output').map((event) => {
    const data = eventData(event);
    return { eventId: event.eventId, turnId: event.turnId || data.turnId || null, toolCallId: data.toolCallId || null, stream: data.stream,
      outputSeq: data.outputSeq, text: typeof data.text === 'string' ? data.text : '', truncated: data.truncated === true,
      rawBytesRead: data.rawBytesRead, sourceSeqThrough: data.sourceSeqThrough };
  });
}
// The product stores one outputSeq sequence per tool call (stdout and stderr share it); persisted order must follow it.
function evaluateStreamOrder(frames) {
  const byCall = new Map();
  for (const frame of frames) {
    if (!byCall.has(frame.toolCallId)) byCall.set(frame.toolCallId, []);
    byCall.get(frame.toolCallId).push(frame);
  }
  const problems = [];
  for (const [call, list] of byCall) {
    list.forEach((frame, index) => {
      if (frame.outputSeq !== index + 1) problems.push(`call=${call}:position=${index + 1}:outputSeq=${frame.outputSeq}`);
      if (index > 0 && frame.eventId <= list[index - 1].eventId) problems.push(`call=${call}:eventId_not_increasing_at=${index + 1}`);
    });
  }
  return { ok: frames.length > 0 && problems.length === 0, calls: byCall.size, frames: frames.length, problems: problems.slice(0, 8) };
}
function textsPerStream(frames, stream) { return frames.filter((frame) => frame.stream === stream).map((frame) => frame.text).join(''); }

// samples: [{ t, domFrameTexts, dbFrameTexts, ipcEventIds, dbEventIds }]. DOM and IPC are read before the DB in each sample,
// so anything they show must already be in the DB. A sample with nothing to show proves nothing; at least one frame must be seen.
function evaluateDomAfterDb(samples) {
  const violations = [];
  let seen = 0;
  for (const sample of samples) {
    for (const text of sample.domFrameTexts || []) {
      seen += 1;
      if (!(sample.dbFrameTexts || []).includes(text)) violations.push({ t: sample.t, kind: 'dom', text: String(text).slice(0, 60) });
    }
    for (const id of sample.ipcEventIds || []) {
      seen += 1;
      if (!(sample.dbEventIds || []).includes(id)) violations.push({ t: sample.t, kind: 'ipc', eventId: id });
    }
  }
  return { ok: violations.length === 0 && seen > 0, samples: samples.length, observations: seen, violations: violations.slice(0, 5) };
}
// firstTickVisibleMs and commandEndedMs are driver-clock offsets; the contract needs the first tick at least 1 s earlier.
function evaluateLiveTick(firstTickVisibleMs, commandEndedMs, minimumLeadMs) {
  const need = minimumLeadMs === undefined ? 1000 : minimumLeadMs;
  if (!Number.isFinite(firstTickVisibleMs) || !Number.isFinite(commandEndedMs)) return { ok: false, lead_ms: null, required_ms: need, reason: 'missing observation' };
  const lead = commandEndedMs - firstTickVisibleMs;
  return { ok: lead >= need, lead_ms: lead, required_ms: need };
}
function secretLeak(text, secret) {
  const value = String(text || '');
  const needle = String(secret || '');
  if (!needle) return { leaked: false, checked: false };
  return { leaked: value.includes(needle) || value.includes(needle.slice(0, 10)), checked: true };
}
function descendantsOf(rows, rootPid) {
  const children = new Map();
  for (const row of rows) {
    const parent = Number(row.ParentProcessId);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(row);
  }
  const out = [];
  const stack = [Number(rootPid)];
  const seen = new Set(stack);
  while (stack.length) {
    for (const child of children.get(stack.pop()) || []) {
      const pid = Number(child.ProcessId);
      if (seen.has(pid)) continue;
      seen.add(pid);
      out.push({ pid, parent: Number(child.ParentProcessId), name: child.Name, created: child.CreationDate || '' });
      stack.push(pid);
    }
  }
  return out;
}
// A process is the same instance only if pid and creation stamp both match.
function stillAlive(before, rows) {
  const now = new Map(rows.map((row) => [Number(row.ProcessId), row.CreationDate || '']));
  return before.filter((item) => now.has(item.pid) && now.get(item.pid) === item.created);
}
function newProcesses(baseline, current) {
  const known = new Set(baseline.map((item) => `${item.pid}:${item.created}`));
  return current.filter((item) => !known.has(`${item.pid}:${item.created}`));
}
function toolEndsFor(events, toolName) {
  return (events || []).filter((event) => event.eventType === 'tool_end' && eventData(event).toolName === toolName);
}
function summarizeToolEnd(event) {
  const data = eventData(event);
  const text = JSON.stringify(data);
  return { eventId: event.eventId, toolName: data.toolName, ok: data.ok === undefined ? null : data.ok, error: data.error ? String(data.error.code || data.error).slice(0, 80) : null, head: text.slice(0, 200) };
}
function toolEndFailed(event) {
  const data = eventData(event);
  const text = JSON.stringify(data);
  return data.ok === false || Boolean(data.error) || /"status"\s*:\s*"(error|failed|rejected)"/.test(text) || /A9_[A-Z_]*(INVALID|LIMIT|OWNER|EXPIRED|REJECT)/.test(text);
}
function normalizeCrlf(text) { return String(text || '').replace(/\r\n/g, '\n'); }
// Combines sub-observations: any FAIL fails, otherwise any UNKNOWN is unknown, otherwise all PASS.
function combineStatus(statuses) {
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('UNKNOWN') || statuses.includes('NOT_PERFORMED')) return statuses.includes('NOT_PERFORMED') ? 'NOT_PERFORMED' : 'UNKNOWN';
  return statuses.length > 0 && statuses.every((status) => status === 'PASS') ? 'PASS' : 'UNKNOWN';
}
// Sub-journeys never promote an unobserved fact: ok === null is UNKNOWN, a violated expectation is FAIL.
function subResult(name, ok, detail) {
  return { name, status: ok === null || ok === undefined ? 'UNKNOWN' : ok ? 'PASS' : 'FAIL', detail: String(detail === undefined ? '' : detail).slice(0, 400) };
}
function summarizeSubs(subs) {
  return { status: combineStatus(subs.map((item) => item.status)), text: subs.map((item) => `${item.name}=${item.status}`).join('; ') };
}
// A guard refused the request when it returned the named structured error and neither the Provider nor the event log moved.
function guardRefused(result, code, requests, continueEvents) {
  return Boolean(result) && result.ok === false && Boolean(result.error) && result.error.code === code
    && Boolean(requests) && requests.before === requests.after && Boolean(continueEvents) && continueEvents.before === continueEvents.after;
}
// Persisted-fact writers shared by the guard journeys and their runtime-backed tests. They write the same rows the A9-32
// lifecycle tests write, into the candidate's own database, and nothing else.
const GUARD_STAMP = '2026-01-01T00:00:00.000Z';
const RESIDUE_PID = 2147483000;
function insertInterruptedTask(db, conversation, taskId, oldTurnId) {
  db.prepare("INSERT INTO a9_tasks(task_id,session_id,status,created_at,updated_at) VALUES(?,?,'interrupted',?,?)").run(taskId, conversation, GUARD_STAMP, GUARD_STAMP);
  db.prepare("INSERT INTO a9_turns(turn_id,task_id,session_id,status,outcome_json,created_at,updated_at) VALUES(?,?,?,'interrupted','{}',?,?)").run(oldTurnId, taskId, conversation, GUARD_STAMP, GUARD_STAMP);
  db.prepare("INSERT INTO a9_events(session_id,turn_id,kind,event_type,payload_json,created_at) VALUES(?,NULL,'model','conversation.request',?,?)")
    .run(conversation, JSON.stringify({ taskId, requestPrompt: 'b2 guard continue' }), GUARD_STAMP);
}
// A cleanup_required managed-process fact with a pid that cannot exist; it is removed again by deleteResidueFact.
function insertResidueFact(db, workspacePath, handleId) {
  db.prepare('INSERT INTO a9_managed_processes (handle_id, workspace_path, pid, command, cwd, started_at, last_probe_status, pid_reuse_possible) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
    .run(handleId, workspacePath, RESIDUE_PID, 'b2 injected residue fact (no process)', workspacePath, GUARD_STAMP, 'cleanup_required');
}
function deleteResidueFact(db, handleId) { db.prepare('DELETE FROM a9_managed_processes WHERE handle_id = ?').run(handleId); }
// The v2 mode settings file is the only *.json in workspace-modes that is not a v1 file; anything else is not unique.
function findModeSettingsFile(dataRoot) {
  const directory = path.join(dataRoot, 'workspace-modes');
  const names = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => /\.json$/.test(name) && !/\.v1\.json$/.test(name)) : [];
  return { count: names.length, file: names.length === 1 ? path.join(directory, names[0]) : null };
}
const CORRUPT_MODE_SETTINGS = '{ "schemaVersion": ';

const CARD_BUTTON_READY = '继续';
const CARD_BUTTON_BUSY = '正在继续';
// B2-UI-01: the whole journey is judged from observed facts; a missing observation stays UNKNOWN.
function evaluateUiJourney(f) {
  const facts = f || {};
  const card0 = facts.card0 || null;
  const enter = facts.enter || null;
  const stopped = facts.stopped || null;
  const back = facts.view_return || null;
  const space = facts.space || null;
  const scroll = enter && enter.scroll ? enter.scroll : null;
  const subs = [];
  subs.push(subResult('card_ready', card0 ? card0.button === CARD_BUTTON_READY && card0.disabled === false : null, card0 ? `button=${card0.button}; disabled=${card0.disabled}` : 'no card observed'));
  subs.push(subResult('loading_feedback', enter ? enter.busy_label === true && enter.button_disabled === true : null,
    enter ? `busy_label=${enter.busy_label}; button_disabled=${enter.button_disabled}` : 'Enter journey not observed'));
  subs.push(subResult('focus_stays_on_card_while_busy', enter && enter.focus_in_card !== null && enter.focus_in_card !== undefined ? enter.focus_in_card === true : null,
    enter ? `focus_in_card=${enter.focus_in_card}` : 'Enter journey not observed'));
  subs.push(subResult('no_scroll_theft', scroll && scroll.testable === true ? Math.abs(Number(scroll.after) - Number(scroll.before)) <= 2 : null,
    scroll ? `testable=${scroll.testable}; before=${scroll.before}; after=${scroll.after}` : 'scroll not observed'));
  subs.push(subResult('one_dispatch_while_busy', enter && Number.isSafeInteger(enter.continue_events_while_busy) && Number.isSafeInteger(enter.continue_events_after_extra_keys)
    ? enter.continue_events_while_busy === 1 && enter.continue_events_after_extra_keys === 1 : null,
  enter ? `events_busy=${enter.continue_events_while_busy}; events_after_extra_keys=${enter.continue_events_after_extra_keys}` : 'Enter journey not observed'));
  subs.push(subResult('stop_returns_actionable_new_card', stopped && stopped.card ? stopped.card.disabled === false && stopped.card.button === CARD_BUTTON_READY
    && stopped.interrupted_turn_changed === true && stopped.revision_changed === true : null,
  stopped && stopped.card ? `button=${stopped.card.button}; disabled=${stopped.card.disabled}; turn_changed=${stopped.interrupted_turn_changed}; revision_changed=${stopped.revision_changed}` : 'no card after Stop'));
  subs.push(subResult('focus_on_card_after_stop', stopped && stopped.focus_in_card !== null && stopped.focus_in_card !== undefined ? stopped.focus_in_card === true : null,
    stopped ? `focus_in_card=${stopped.focus_in_card}` : 'Stop not observed'));
  subs.push(subResult('view_return_keeps_card', back && back.card ? back.card.disabled === false && back.card.button === CARD_BUTTON_READY : null,
    back && back.card ? `button=${back.card.button}; disabled=${back.card.disabled}` : 'no card after view return'));
  subs.push(subResult('space_retry_creates_one_more_turn', space ? space.continue_events_total === 2 && space.ipc_continue_calls_total === 2 && /^completed/.test(String(space.second_turn_status || '')) : null,
    space ? `events_total=${space.continue_events_total}; ipc_calls=${space.ipc_continue_calls_total}; second_turn=${space.second_turn_status}` : 'Space retry not observed'));
  return subs;
}

// Pages through events with beforeEventId; the union must equal the full list in order.
function evaluatePaging(full, pages) {
  const merged = [];
  for (const page of pages) merged.unshift(...page);
  const fullIds = full.map((event) => event.eventId);
  const mergedIds = merged.map((event) => event.eventId);
  return { ok: fullIds.length > 0 && JSON.stringify(fullIds) === JSON.stringify(mergedIds), full: fullIds.length, merged: mergedIds.length, pages: pages.length };
}

// ---- Driver (Electron only) ------------------------------------------------------------------------------------

const results = [];
const evidenceIndex = [];
function record(caseId, n, status, observed) {
  results.push({ case_id: caseId, assertion_id: assertionId(caseId, n), status, observed: String(observed === undefined ? '' : observed).slice(0, 1900) });
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

const EXIT_BUTTONS = Object.freeze(['停止后退出', '留给系统后退出', '取消']);

async function runDriver() {
  const { app, BrowserWindow, dialog, ipcMain } = require('electron');
  const env = process.env;
  const MODE = env.A9_BATCH2_MODE;
  const attemptDir = env.A9_BATCH2_ATTEMPT_DIR;
  const workspaceRoot = env.A9_BATCH2_WORKSPACE;
  const dataRoot = env.A9_BATCH2_DATAROOT;
  const fixtureUrl = env.A9_BATCH2_FIXTURE_URL;
  const fixtureControl = env.A9_BATCH2_FIXTURE_CONTROL;
  const secretLiteral = env.A9_BATCH2_SECRET_LITERAL || '';
  const candidateRoot = env.A9_BATCH2_CANDIDATE_ROOT;
  const providerLog = env.A9_BATCH2_PROVIDER_LOG || '';
  const resultFile = env.A9_BATCH2_DRIVER_RESULT;
  const startedAt = Date.now();
  const ipcLog = [];
  const dialogLog = [];
  let driverExitCode = 0;
  let win = null;
  let ownsExit = false;
  let onDialogReturned = null;

  const out = (name, value) => {
    const target = path.join(attemptDir, name);
    if (Buffer.isBuffer(value)) fs.writeFileSync(target, value);
    else if (typeof value === 'string') fs.writeFileSync(target, value, 'utf8');
    else writeJson(target, value);
    if (!evidenceIndex.includes(name)) evidenceIndex.push(name);
  };
  const readJsonFile = (name) => JSON.parse(fs.readFileSync(path.join(attemptDir, name), 'utf8'));
  const exec = (code) => win.webContents.executeJavaScript(code);
  const screenshot = async (name) => { out(name, (await win.webContents.capturePage()).toPNG()); };
  const marker = (name, value) => fs.writeFileSync(path.join(attemptDir, name), `${JSON.stringify(value)}\n`, 'utf8');

  function httpJson(method, url, body) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? null : JSON.stringify(body);
      const request = http.request(url, { method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (response) => {
        let text = '';
        response.on('data', (chunk) => { text += chunk; });
        response.on('end', () => { try { resolve(JSON.parse(text || '{}')); } catch (error) { reject(error); } });
      });
      request.on('error', reject);
      if (data) request.write(data);
      request.end();
    });
  }
  const counters = () => httpJson('GET', `${fixtureControl}/counters`);
  const setFixture = (state) => httpJson('POST', `${fixtureControl}/state`, state);
  const providerLines = () => (providerLog && fs.existsSync(providerLog) ? fs.readFileSync(providerLog, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);

  async function waitFor(condition, timeoutMs, label) {
    const start = Date.now();
    let lastError = '';
    while (Date.now() - start < timeoutMs) {
      try { const value = await condition(); if (value) return value; } catch (error) { lastError = String(error && error.message ? error.message : error); }
      await sleep(250);
    }
    throw new Error(`TIMEOUT:${label}:${lastError}`);
  }

  // ---- SQLite inspection through the candidate's own better-sqlite3 -----------------------------------------------
  let sqliteModule = null;
  function openDb(readonly) {
    if (!sqliteModule) sqliteModule = require(path.join(env.WIN7AGENT_A9_ELECTRON_SQLITE, 'node_modules', 'better-sqlite3'));
    return new sqliteModule(path.join(dataRoot, 'a9-state.db'), readonly ? { readonly: true, fileMustExist: true } : { fileMustExist: true, timeout: 5000 });
  }
  function dbAll(sql, ...params) {
    const db = openDb(true);
    try { return db.prepare(sql).all(...params); } finally { db.close(); }
  }
  const turnStatus = (turnId) => { const row = dbAll('SELECT status FROM a9_turns WHERE turn_id = ?', turnId)[0]; return row ? row.status : null; };
  const toolEventCount = (turnId) => dbAll("SELECT count(*) AS n FROM a9_events WHERE turn_id = ? AND event_type IN ('tool_start','tool_end','tool_output')", turnId)[0].n;

  // ---- Product facts ------------------------------------------------------------------------------------------------
  const snapshot = async () => { const r = await exec('window.win7Agent.a9.snapshot()'); if (!r || !r.ok) throw new Error(`SNAPSHOT_FAILED:${JSON.stringify(r && r.error)}`); return r.snapshot; };
  const events = async (conversationId, limit = 1000, extra = {}) => {
    const r = await exec(`window.win7Agent.a9.queryEvents(${JSON.stringify({ conversationId, limit, ...extra })})`);
    if (!r || !r.ok) throw new Error(`EVENTS_FAILED:${JSON.stringify(r && r.error)}`);
    return r;
  };
  const domState = () => exec(`(() => {
    const stream = document.getElementById('a9-task-stream');
    const cancel = document.getElementById('cancel-task');
    return { visible: document.body.innerText, present: document.body.textContent, outcome: (document.getElementById('a9-turn-outcome') || {}).textContent || '',
      cancelHidden: cancel ? cancel.hidden : null, cancelLabel: cancel ? cancel.textContent : null,
      cards: document.querySelectorAll('section.continuation-card').length, streamScroll: stream ? stream.scrollTop : null };
  })()`);
  // The scrolling element of the task stream is #conversation, not #a9-task-stream.
  const scrollProbe = (toTop) => exec(`(() => { const c = document.getElementById('conversation'); if (!c) return null; if (${toTop === true}) c.scrollTop = 0;
    return { top: c.scrollTop, height: c.scrollHeight, client: c.clientHeight }; })()`);
  const focusProbe = () => exec(`(() => { const a = document.activeElement; const c = document.querySelector('section.continuation-card');
    return { tag: a ? a.tagName : null, cls: a ? String(a.className || '').slice(0, 60) : null, inCard: Boolean(c && a && c.contains(a)) }; })()`);
  const press = (keyCode) => {
    win.show(); win.focus(); win.webContents.focus();
    for (const type of ['keyDown', 'char', 'keyUp']) win.webContents.sendInputEvent({ type, keyCode });
  };
  const continueEventsFor = async (conv, taskId) => (await events(conv, 1000)).events.filter((e) => e.eventType === 'task_continue_requested' && eventData(e).taskId === taskId);
  const continueIpcCalls = () => ipcLog.filter((item) => item.action === 'a9.task.continue').length;
  const cardInfo = () => exec(`(() => { const c = document.querySelector('section.continuation-card'); const b = c && c.querySelector('button');
    return c ? { text: c.innerText, button: b ? b.textContent : null, disabled: b ? b.disabled : null } : null; })()`);
  const clickContinue = () => exec(`(() => { const b = document.querySelector('section.continuation-card button'); if (!b) return 'no-card'; b.click(); return 'clicked'; })()`);
  const findRecovery = async (taskId) => ((await snapshot()).recoveryTasks || []).find((item) => item.taskId === taskId) || null;
  const lastTurnOf = (evts) => { const started = evts.filter((e) => e.eventType === 'turn_started'); return started.length ? started[started.length - 1].turnId : null; };

  function wmicRows() {
    const result = childProcess.spawnSync('wmic.exe', ['process', 'get', 'ProcessId,ParentProcessId,Name,CreationDate', '/format:csv'], { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    const lines = String(result.stdout || '').replace(/\r/g, '').split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];
    const header = lines[0].split(',');
    return lines.slice(1).map((line) => { const cells = line.split(','); const row = {}; header.forEach((name, index) => { row[name] = cells[index]; }); return row; });
  }
  const myTree = () => descendantsOf(wmicRows(), process.pid);

  // ---- UI actions through the real DOM ----------------------------------------------------------------------------
  async function selectWorkspace() {
    await exec('document.getElementById("workspace-select").click(); true');
    await waitFor(() => exec(`(() => { const s = document.getElementById('a9-surface'); return s && !s.hidden && s.dataset.a9Status ? true : null; })()`), 30000, 'a9 surface');
  }
  async function ensureMode() {
    if ((await snapshot()).mode === 'full_access') return;
    await exec('document.querySelector(\'input[name="a9-mode-choice"][value="full_access"]\').checked = true; document.getElementById("a9-mode-apply").click(); true');
    await waitFor(async () => (await snapshot()).mode === 'full_access', 20000, 'full_access');
  }
  async function ensureProvider() {
    const current = await snapshot();
    if (current.provider && current.provider.configured && (await exec('document.getElementById("a9-provider-probe-state").textContent')) === 'tool_calling') return;
    await exec(`(() => {
      document.getElementById('a9-provider-url').value = ${JSON.stringify(fixtureUrl)};
      document.getElementById('a9-provider-model').value = 'batch2-scripted';
      const key = document.getElementById('a9-provider-key'); if (key) key.value = ${JSON.stringify(secretLiteral)};
      const remember = document.getElementById('a9-provider-remember'); if (remember) remember.checked = false;
      document.getElementById('a9-provider-apply').click();
      return true;
    })()`);
    await waitFor(async () => (await exec('document.getElementById("a9-provider-probe-state").textContent')) === 'tool_calling', 45000, 'provider probe');
    await exec('(() => { const b = document.querySelector(".drawer:not([hidden]) [data-close]"); if (b) b.click(); return true; })()');
  }
  async function bootstrap() {
    await waitFor(() => exec('document.readyState === "complete"'), 30000, 'renderer ready');
    await selectWorkspace();
    await ensureMode();
    await ensureProvider();
    const snap = await snapshot();
    await setFixture({ shellKind: snap.shell && snap.shell.kind === 'powershell' ? 'powershell' : 'cmd' });
    return snap;
  }
  async function submit(prompt) {
    await exec(`(() => { const p = document.getElementById('task-prompt'); p.value = ${JSON.stringify(prompt)}; p.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('run-task').click(); return true; })()`);
  }
  // Idle means no Turn is running. A managed background process keeps controls.canStop true, so only stopKind 'turn' counts as busy.
  const waitIdle = (timeoutMs, label) => waitFor(async () => { const snap = await snapshot(); return snap.controls && snap.controls.stopKind !== 'turn' && snap.agentStatus !== 'running' ? snap : null; }, timeoutMs, label || 'idle');
  const conversationId = async () => (await snapshot()).activeConversationId;
  async function newConversation() {
    const before = await conversationId();
    await exec('(() => { const b = document.getElementById("conversation-new"); if (b && !b.disabled) b.click(); return true; })()');
    return waitFor(async () => { const id = await conversationId(); return id && id !== before ? id : null; }, 20000, 'new conversation');
  }
  async function activateConversation(id) {
    if ((await conversationId()) === id) return;
    await exec(`window.win7Agent.a9.activateConversation(${JSON.stringify(id)})`);
    await waitFor(async () => (await conversationId()) === id, 20000, 'activate conversation');
  }
  async function reloadRenderer() {
    const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload();
    await loaded;
    await waitFor(() => exec('document.readyState === "complete"'), 30000, 'reload ready');
    await sleep(800);
  }

  // Samples DOM, then IPC (snapshot timeline), then DB, so anything the first two show must already be persisted.
  async function observeUntil(done, timeoutMs, label) {
    const started = Date.now();
    const samples = [];
    let firstVisible = null;
    let toolEndedAt = null;
    const conv = await conversationId();
    while (Date.now() - started < timeoutMs) {
      const t = Date.now() - started;
      const dom = await domState();
      const snap = await snapshot();
      const ipcEventIds = (snap.timeline || []).filter((item) => item.type === 'tool_output' && Number.isSafeInteger(item.eventId)).map((item) => item.eventId);
      const evts = (await events(conv, 1000)).events;
      const frames = framesFromEvents(evts);
      const domFrameTexts = frames.filter((frame) => frame.text.trim() && dom.present.includes(frame.text.trim())).map((frame) => frame.text);
      samples.push({ t, domFrameTexts, dbFrameTexts: frames.map((frame) => frame.text), ipcEventIds, dbEventIds: frames.map((frame) => frame.eventId), frames: frames.length, outcome: dom.outcome });
      if (firstVisible === null && frames.some((frame) => frame.text.trim() && dom.visible.includes(frame.text.trim()))) firstVisible = t;
      if (toolEndedAt === null && evts.some((e) => e.eventType === 'tool_end' && ['shell', 'start_process'].includes(eventData(e).toolName))) toolEndedAt = t;
      if (await done(evts, dom, t)) return { samples, firstVisible, toolEndedAt, events: evts, dom };
      await sleep(150);
    }
    throw new Error(`TIMEOUT:${label}`);
  }
  const terminalReached = (evts) => evts.some((e) => e.eventType === 'turn_completed' || e.eventType === 'turn_failed');

  async function runPrompt(token, timeoutMs) {
    await newConversationIfBusy();
    await submit(token);
    return observeUntil(async (evts) => terminalReached(evts), timeoutMs || 120000, token);
  }
  async function newConversationIfBusy() { const snap = await snapshot(); if (snap.controls && snap.controls.canStop) throw new Error('A9_BATCH2_DRIVER_PRODUCT_BUSY'); }

  // The smoke kills this process tree on <mode>.ready; the facts are persisted first so the next process can compare.
  async function interruptAt(kind, preName, prelude) {
    await bootstrap();
    await newConversation();
    const conv = await conversationId();
    // An optional completed Turn first gives the stream enough rows to scroll.
    if (prelude) {
      await submit(prelude);
      await observeUntil(async (evts) => terminalReached(evts), 120000, prelude);
    }
    let approval = null;
    if (kind === 'approval') {
      await submit('b2:hold');
      approval = (await waitFor(async () => { const s = await snapshot(); return s.pendingApproval ? s : null; }, 90000, 'pending approval')).pendingApproval;
    } else {
      await submit('b2:unknown-shell');
      await waitFor(async () => framesFromEvents((await events(conv, 1000)).events).length >= 1, 90000, 'first shell frame');
    }
    const c = await counters();
    const evts = (await events(conv, 1000)).events;
    const turnId = lastTurnOf(evts);
    const task = dbAll('SELECT task_id, status FROM a9_tasks WHERE session_id = ? ORDER BY rowid DESC LIMIT 1', conv)[0];
    const pre = { kind, conversationId: conv, turnId, taskId: task ? task.task_id : null, taskStatus: task ? task.status : null, turnStatus: turnStatus(turnId),
      approval, counters: c, toolEvents: toolEventCount(turnId), fileExists: fs.existsSync(path.join(workspaceRoot, 'b2-hold.txt')), provider_lines: providerLines().length };
    out(preName, pre);
    marker(`${MODE}.ready`, { pid: process.pid, kind });
    await sleep(120000);
  }

  // Restart-side facts shared by the chain and the continue phases: zero requests after restart and refresh.
  async function recoverFacts(pre) {
    const baseline = await counters();
    await bootstrap();
    await activateConversation(pre.conversationId);
    const afterBoot = await counters();
    const recovery = await waitFor(() => findRecovery(pre.taskId), 45000, 'recovery fact');
    await waitFor(async () => (await domState()).cards > 0, 30000, 'continue card');
    const state1 = { turn: turnStatus(pre.turnId), tools: toolEventCount(pre.turnId), file: fs.existsSync(path.join(workspaceRoot, 'b2-hold.txt')) };
    const card = await cardInfo();
    await reloadRenderer();
    await activateConversation(pre.conversationId);
    await waitFor(async () => (await domState()).cards > 0, 30000, 'continue card after refresh');
    await sleep(2500);
    const afterRefresh = await counters();
    const state2 = { turn: turnStatus(pre.turnId), tools: toolEventCount(pre.turnId), file: fs.existsSync(path.join(workspaceRoot, 'b2-hold.txt')) };
    const pending = (await snapshot()).pendingApproval || null;
    return { baseline, afterBoot, afterRefresh, recovery, card, state1, state2, pending };
  }
  const zeroAdded = (pre, facts) => facts.afterBoot.requests === pre.counters.requests && facts.afterRefresh.requests === pre.counters.requests
    && facts.state1.tools === pre.toolEvents && facts.state2.tools === pre.toolEvents;
  const oldApprovalResult = (pre) => exec(`window.win7Agent.a9.resumeApproval(${JSON.stringify(pre.approval.approvalId)}, 'approved', ${JSON.stringify(pre.approval.bindingDigest)}, ${JSON.stringify(pre.conversationId)}, ${JSON.stringify(pre.taskId)}, ${JSON.stringify(pre.turnId)})`);

  // ---- Modes: chain (p03) ------------------------------------------------------------------------------------------------

  async function chainA() {
    const snap = await bootstrap();
    const manifest = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'release-manifest.json'), 'utf8'));
    const runtimeJson = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'resources', 'app', 'a9-runtime.json'), 'utf8'));
    const sha = (relative) => sha256(fs.readFileSync(path.join(candidateRoot, ...relative.split('/'))));
    const helperSha = sha('resources/native/runner/spike02_helper.exe');
    const sqliteNodeSha = sha('resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node');
    const mainSha = sha('resources/app/product/main.js');
    const manifestEntry = (relative) => (manifest.files || []).find((item) => item.path === relative);
    const sqliteVersion = dbAll('select sqlite_version() as v')[0].v;
    out('01-start-identity.json', { electron: process.versions.electron, node: process.versions.node, abi: process.versions.modules, exec_path: process.execPath,
      app_path: app.getAppPath(), helper_sha256: helperSha, better_sqlite3_sha256: sqliteNodeSha, main_js_sha256: mainSha, sqlite_version: sqliteVersion,
      runtime: { release_id: runtimeJson.release_id, version: runtimeJson.version, lock_id: runtimeJson.lock_id, candidate: runtimeJson.candidate,
        protocol: runtimeJson.runner_helper_protocol, profile: runtimeJson.runner_helper_profile },
      manifest_native: manifest.required_native, shell: snap.shell, data_root: dataRoot });
    out('01-package-load.json', { product_main: env.A9_BATCH2_PRODUCT_MAIN, main_js_matches_manifest: (manifestEntry('resources/app/product/main.js') || {}).sha256 === mainSha,
      snapshot_status: snap.status, workspace_root: snap.workspaceRoot, mode: snap.mode, provider_configured: Boolean(snap.provider && snap.provider.configured) });
    await screenshot('01-start.png');
    const identityOk = process.versions.electron === '22.3.27' && process.versions.modules === '110' && sqliteVersion === '3.43.1'
      && helperSha === manifest.required_native.runner_helper && sqliteNodeSha === manifest.required_native.better_sqlite3_node
      && (manifestEntry('resources/app/product/main.js') || {}).sha256 === mainSha && runtimeJson.candidate === 'WIN7-43' && snap.status === 'ready';
    record('B2-CH-01-START', 1, identityOk ? 'PASS' : 'FAIL', `electron=${process.versions.electron}; abi=${process.versions.modules}; sqlite=${sqliteVersion}; helper_match=${helperSha === manifest.required_native.runner_helper}; sqlite_node_match=${sqliteNodeSha === manifest.required_native.better_sqlite3_node}; status=${snap.status}`);
    // B2-CH-01 A02 (SID, session, integrity, elevation, job, old trees) is decided by the smoke from the controller identity.

    await newConversation();
    const conv = await conversationId();
    const baselineTree = myTree();
    await submit('b2:bg-start');
    const observed = await observeUntil(async (evts) => framesFromEvents(evts).length >= 6 || terminalReached(evts), 90000, 'background frames');
    const running = (await snapshot()).managedProcesses.filter((item) => ['running', 'starting'].includes(item.lastProbeStatus));
    const frames = framesFromEvents(observed.events);
    const stdoutText = textsPerStream(frames, 'stdout');
    const stderrText = textsPerStream(frames, 'stderr');
    const domOrder = evaluateDomAfterDb(observed.samples);
    await screenshot('02-output.png');
    out('02-output-frames.jsonl', `${frames.map((frame) => JSON.stringify(frame)).join('\n')}\n`);
    out('02-background.json', { samples: observed.samples.map((s) => ({ t: s.t, frames: s.frames, domFrames: s.domFrameTexts.length, ipcFrames: s.ipcEventIds.length })), first_visible_ms: observed.firstVisible,
      running_at_observation: running.map((item) => ({ handleId: item.handleId, pid: item.pid, status: item.lastProbeStatus })), dom_after_db: domOrder,
      stdout_head: stdoutText.slice(0, 120), stderr_head: stderrText.slice(0, 120) });
    const visibleBeforeEnd = observed.firstVisible !== null && running.length === 1 && /tick \d/.test(stdoutText) && /err \d/.test(stderrText);
    record('B2-CH-02-BACKGROUND', 1, visibleBeforeEnd && domOrder.ok ? 'PASS' : 'FAIL',
      `first_visible_ms=${observed.firstVisible}; running_processes=${running.length}; stdout_has_tick=${/tick \d/.test(stdoutText)}; stderr_has_err=${/err \d/.test(stderrText)}; dom_after_db_violations=${domOrder.violations.length}; observations=${domOrder.observations}`);
    const handle = running[0];
    const startEnd = toolEndsFor(observed.events, 'start_process')[0];
    const bound = Boolean(handle) && Boolean(startEnd) && JSON.stringify(eventData(startEnd)).includes(handle.handleId);
    const oneCall = frames.length > 0 && frames.every((frame) => frame.toolCallId === frames[0].toolCallId && frame.turnId === frames[0].turnId);
    record('B2-CH-02-BACKGROUND', 2, bound && oneCall ? 'PASS' : 'FAIL', `frames=${frames.length}; one_tool_call_and_turn=${oneCall}; handle=${handle ? handle.handleId : 'none'}; start_end_binds_handle=${bound}`);

    // The command tree is what appeared after the baseline: the helper, Electron children and conhost are infrastructure, not command processes.
    const infrastructure = (item) => /^(electron|conhost|spike02_helper)\.exe$/i.test(item.name || '');
    const treeBefore = newProcesses(baselineTree, myTree()).filter((item) => !infrastructure(item));
    const stopStarted = Date.now();
    await exec('document.getElementById("cancel-task").click(); true');
    const feedback = await waitFor(async () => {
      const dom = await domState();
      const snap2 = await snapshot();
      return dom.cancelHidden === true || snap2.controls.stopKind === 'none' || snap2.managedProcesses.some((item) => !['running', 'starting'].includes(item.lastProbeStatus) && item.handleId === (handle && handle.handleId))
        ? { ms: Date.now() - stopStarted, stopKind: snap2.controls.stopKind } : null;
    }, 20000, 'stop feedback');
    const idle = await waitFor(async () => { const s = await snapshot(); return s.controls.canStop === false ? s : null; }, 60000, 'stop completed');
    await sleep(1500);
    const treeAfter = wmicRows();
    const survivors = stillAlive(treeBefore, treeAfter);
    const afterEvents = (await events(conv, 1000)).events;
    const stopEnds = toolEndsFor(afterEvents, 'stop_process').map(summarizeToolEnd);
    const factAfter = idle.managedProcesses.find((item) => handle && item.handleId === handle.handleId);
    await screenshot('03-stop.png');
    out('03-stop.json', { feedback_ms: feedback.ms, feedback, stop_ends: stopEnds, fact_after: factAfter || null });
    out('03-process-tree.json', { before: treeBefore, survivors, after_total: treeAfter.length });
    out('03-held-exit.json', { handle: handle ? handle.handleId : null, fact_after: factAfter || null });
    const noneActive = idle.managedProcesses.every((item) => !['running', 'starting', 'running_unknown', 'identity_mismatch'].includes(item.lastProbeStatus));
    const lastFrame = frames[frames.length - 1];
    // An empty command tree means the processes were not observed, so a missing survivor would prove nothing.
    const stopVerdict = survivors.length > 0 || !noneActive || feedback.ms > 3000 ? 'FAIL' : treeBefore.length === 0 ? 'UNKNOWN' : 'PASS';
    record('B2-CH-03-STOP', 1, stopVerdict,
      `feedback_ms=${feedback.ms}; command_tree_before=${treeBefore.length}; survivors=${survivors.length}; active_after=${!noneActive}; frames_before_stop=${frames.length}; last_frame_seq=${lastFrame ? lastFrame.outputSeq : 'none'}`);
    const stopSchema = providerLines().map((entry) => entry.tool_params && entry.tool_params.stop_process).filter(Boolean)[0];
    const noCleanup = idle.managedProcesses.every((item) => item.cleanupRequired !== true);
    record('B2-CH-03-STOP', 2, Array.isArray(stopSchema) && stopSchema.length === 1 && stopSchema[0] === 'handleId' && noCleanup ? 'PASS' : stopSchema ? 'FAIL' : 'UNKNOWN',
      `stop_process_params=${JSON.stringify(stopSchema)}; cleanup_required_residue=${!noCleanup}`);
  }

  const chainInterrupt = () => interruptAt('approval', '04-interruption-pre.json');

  async function chainRecover() {
    const pre = readJsonFile('04-interruption-pre.json');
    const facts = await recoverFacts(pre);
    const evts = (await events(pre.conversationId, 1000)).events.filter((e) => e.turnId === pre.turnId);
    await screenshot('04-card.png');
    out('04-interruption.json', { pre, recovery: facts.recovery, card: facts.card, state_after_restart: facts.state1, state_after_refresh: facts.state2, pending_approval_after_restart: facts.pending });
    out('04-restart-counters.json', { kill_time_requests: pre.counters.requests, at_driver_start: facts.baseline, after_bootstrap: facts.afterBoot, after_refresh: facts.afterRefresh,
      tool_events_before: pre.toolEvents, tool_events_after_restart: facts.state1.tools, tool_events_after_refresh: facts.state2.tools });
    out('04-task-turn-events.json', { turn_id: pre.turnId, task_id: pre.taskId, task_status: dbAll('SELECT status FROM a9_tasks WHERE task_id = ?', pre.taskId)[0] || null,
      turn_status: facts.state2.turn, events: evts.map((e) => ({ eventId: e.eventId, eventType: e.eventType })) });
    record('B2-CH-04-INTERRUPT-RESTART', 1, facts.recovery.canContinue === true && facts.card && facts.card.button === '继续' && facts.state1.turn === facts.state2.turn && facts.state2.turn !== 'completed' && facts.pending === null ? 'PASS' : 'FAIL',
      `can_continue=${facts.recovery.canContinue}; card_button=${facts.card && facts.card.button}; turn_status_restart=${facts.state1.turn}; turn_status_refresh=${facts.state2.turn}; pending_approval=${facts.pending ? 'present' : 'none'}`);
    record('B2-CH-04-INTERRUPT-RESTART', 2, zeroAdded(pre, facts) ? 'PASS' : 'FAIL',
      `provider_requests_kill=${pre.counters.requests}; after_bootstrap=${facts.afterBoot.requests}; after_refresh=${facts.afterRefresh.requests}; tool_events=${pre.toolEvents}->${facts.state1.tools}->${facts.state2.tools}`);

    // Step 5: old approval is dead, explicit continue creates one Turn, duplicate key is idempotent, Stop works on the new Turn.
    const resume = await oldApprovalResult(pre);
    const fileStillThere = fs.existsSync(path.join(workspaceRoot, 'b2-hold.txt'));
    const before = await counters();
    await setFixture({ afterHold: true, holdNext: true });
    const clicked = await clickContinue();
    await waitFor(async () => (await counters()).held >= before.held + 1, 60000, 'continue request held');
    const heldCounters = await counters();
    const focus = await exec(`(() => { const a = document.activeElement; const c = document.querySelector('section.continuation-card'); return { tag: a && a.tagName, inCard: Boolean(c && a && c.contains(a)) }; })()`);
    await screenshot('05-focus-scroll.png');
    const convEvents = (await events(pre.conversationId, 1000)).events;
    const requested = convEvents.filter((e) => e.eventType === 'task_continue_requested' && eventData(e).taskId === pre.taskId);
    const newTurnId = requested.length ? requested[requested.length - 1].turnId : null;
    const dup = await exec(`window.win7Agent.a9.continueTask(${JSON.stringify(pre.conversationId)}, ${JSON.stringify(pre.taskId)}, ${JSON.stringify(pre.turnId)}, ${JSON.stringify(facts.recovery.recoveryRevision)})`);
    const afterDup = await counters();
    const newTurnRow = newTurnId ? dbAll('SELECT task_id FROM a9_turns WHERE turn_id = ?', newTurnId)[0] : null;
    out('05-turn-dedup.json', { clicked, new_turn_id: newTurnId, linked_task: newTurnRow ? newTurnRow.task_id : null, requested_events: requested.length, duplicate_result: dup, counters_held: heldCounters, counters_after_duplicate: afterDup, focus });
    await exec('document.getElementById("cancel-task").click(); true');
    const idle = await waitIdle(60000, 'new turn stopped');
    const newStatus = newTurnId ? turnStatus(newTurnId) : null;
    const audit = (await events(pre.conversationId, 1000)).events.filter((e) => e.turnId === newTurnId && e.eventType.startsWith('tool_'));
    out('05-tool-audit.jsonl', `${audit.map((e) => JSON.stringify({ eventId: e.eventId, eventType: e.eventType, tool: eventData(e).toolName || null })).join('\n')}\n${JSON.stringify({ summary: { new_turn_id: newTurnId, tool_events: audit.length, status: newStatus } })}\n`);
    const lines = providerLines().filter((entry) => entry.index > pre.counters.requests);
    out('05-provider-requests.jsonl', `${lines.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
    out('05-continue-ipc.json', { ipc: ipcLog.filter((item) => ['a9.task.continue', 'a9.turn.resumeApproval', 'a9.turn.stop'].includes(item.action)), old_approval_result: resume,
      stop_kind_after: idle.controls.stopKind });
    const dupSame = dup && dup.ok === true && dup.continuation && dup.continuation.duplicate === true && dup.continuation.turnId === newTurnId;
    record('B2-CH-05-CONTINUE', 1, requested.length === 1 && newTurnRow && newTurnRow.task_id === pre.taskId && dupSame && afterDup.requests === heldCounters.requests ? 'PASS' : 'FAIL',
      `continue_events=${requested.length}; new_turn=${newTurnId}; linked_task=${newTurnRow && newTurnRow.task_id}; duplicate_same_turn=${Boolean(dupSame)}; requests_held=${heldCounters.requests}; requests_after_duplicate=${afterDup.requests}`);
    const firstLine = lines[0] || {};
    const unknownCount = Array.isArray(facts.recovery.unknownResults) ? facts.recovery.unknownResults.length : null;
    const factsDelivered = firstLine.recovery_unknown_count === unknownCount && unknownCount !== null;
    const approvalDead = resume && resume.ok === false && fileStillThere;
    record('B2-CH-05-CONTINUE', 2, approvalDead && factsDelivered && newStatus === 'cancelled' ? 'PASS' : approvalDead && factsDelivered ? 'FAIL' : 'FAIL',
      `old_approval_ok=${resume && resume.ok}; old_approval_error=${resume && resume.error && resume.error.code}; file_still_exists=${fileStillThere}; recovery_unknown_results=${unknownCount}; first_request_recovery_unknown=${firstLine.recovery_unknown_count}; new_turn_status_after_stop=${newStatus}`);
  }

  async function chainExit() {
    await bootstrap();
    await newConversation();
    await submit('b2:bg-start');
    await waitFor(async () => framesFromEvents((await events(await conversationId(), 1000)).events).length >= 2, 90000, 'frames before exit');
    const snap = await snapshot();
    const running = snap.managedProcesses.filter((item) => ['running', 'starting'].includes(item.lastProbeStatus));
    const tree = myTree();
    out('chain-exit-tree-before.json', { driver_pid: process.pid, tree, running: running.map((item) => ({ handleId: item.handleId, pid: item.pid })) });
    ownsExit = true;
    const timer = setTimeout(() => {
      record('B2-CH-06-NORMAL-EXIT', 1, 'FAIL', 'the exit dialog did not return within 150 s');
      writeJson(resultFile, { schema_version: 1, mode: MODE, status: 'DONE', error: null, assertions: results, evidence: evidenceIndex, ipc: ipcLog.slice(-50), dialogs: dialogLog, duration_ms: Date.now() - startedAt });
      app.exit(1);
    }, 150000);
    onDialogReturned = (entry) => {
      clearTimeout(timer);
      const labels = Array.isArray(entry.buttons) ? entry.buttons : [];
      const visibleOk = JSON.stringify(labels) === JSON.stringify(EXIT_BUTTONS);
      out('06-dialog-response.json', { dialog: entry, expected_buttons: EXIT_BUTTONS, active_managed_before_quit: running.length, returned_index: entry.response });
      record('B2-CH-06-NORMAL-EXIT', 1, running.length > 0 && visibleOk && entry.response === 0 ? 'PASS' : 'FAIL',
        `buttons=${JSON.stringify(labels)}; returned_index=${entry.response}; active_managed_before_quit=${running.length}`);
      writeJson(resultFile, { schema_version: 1, mode: MODE, status: 'DONE', error: null, assertions: results, evidence: evidenceIndex, ipc: ipcLog.slice(-50), dialogs: dialogLog, duration_ms: Date.now() - startedAt });
    };
    app.quit();
  }

  // ---- Modes: streaming (p04) ----------------------------------------------------------------------------------------------

  async function streamLive() {
    await bootstrap();
    await newConversation();
    const first = await runPrompt('b2:s01');
    const lead = evaluateLiveTick(first.firstVisible, first.toolEndedAt);
    out('s01-live-tick.json', { first_tick_visible_ms: first.firstVisible, command_ended_ms: first.toolEndedAt, lead, frames: framesFromEvents(first.events).length });
    record('B2-S01-LIVE-TICK', 1, lead.ok ? 'PASS' : 'FAIL', `first_tick_visible_ms=${first.firstVisible}; command_ended_ms=${first.toolEndedAt}; lead_ms=${lead.lead_ms}; required_ms=${lead.required_ms}`);
    await sleep(500);
    await submit('b2:s02');
    const second = await observeUntil(async (evts) => evts.filter((e) => e.eventType === 'turn_completed' || e.eventType === 'turn_failed').length >= 2, 120000, 's02');
    const allFrames = framesFromEvents(second.events);
    const callFrames = allFrames.filter((frame) => frame.toolCallId === (allFrames[allFrames.length - 1] || {}).toolCallId);
    const order = evaluateStreamOrder(callFrames);
    const outLines = textsPerStream(callFrames, 'stdout');
    const errLines = textsPerStream(callFrames, 'stderr');
    const streamsOk = [1, 2, 3, 4].every((n) => outLines.includes(`out ${n}`) && errLines.includes(`err ${n}`))
      && outLines.indexOf('out 1') < outLines.indexOf('out 4') && errLines.indexOf('err 1') < errLines.indexOf('err 4');
    out('s02-stream-order.json', { order, frames: callFrames, stdout: outLines, stderr: errLines });
    record('B2-S02-STREAM-ORDER', 1, order.ok && streamsOk ? 'PASS' : 'FAIL', `ordered=${order.ok}; frames=${order.frames}; problems=${JSON.stringify(order.problems)}; both_streams_complete=${streamsOk}`);
    const merged = evaluateDomAfterDb([...first.samples, ...second.samples]);
    out('s03-sqlite-before-ipc.json', merged);
    record('B2-S03-SQLITE-BEFORE-IPC', 1, merged.ok ? 'PASS' : 'FAIL', `observations=${merged.observations}; violations=${merged.violations.length}; samples=${merged.samples}`);
  }

  async function streamEncodings() {
    const snap = await bootstrap();
    if (!snap.shell || snap.shell.kind !== 'powershell') {
      out('s04-encoding.json', { shell: snap.shell, reason: 'raw byte output needs Windows PowerShell' });
      record('B2-S04-ENCODING-CROSSCHUNK', 1, 'UNKNOWN', `selected Shell is ${snap.shell && snap.shell.kind}; raw byte output needs Windows PowerShell`);
      return;
    }
    const fx = require(path.join(candidateRoot, 'validation', 'a9-batch2-fixtures.cjs')).encodingFixtures();
    await newConversation();
    const outcomes = [];
    for (const [label, expected] of [['utf8', fx.text], ['utf16le', fx.text], ['cp936', '中文'], ['crlf', 'line one\r\nline two\r\nlast line without newline']]) {
      const observed = await runPrompt(`b2:s04-${label}`);
      const frames = framesFromEvents(observed.events);
      const last = frames.filter((frame) => frame.toolCallId === (frames[frames.length - 1] || {}).toolCallId);
      const text = last.map((frame) => frame.text).join('');
      outcomes.push({ label, expected, ok: text.includes(expected), got_head: text.slice(0, 120), frames: last.length });
      await sleep(400);
    }
    out('s04-encoding.json', { shell: snap.shell, outcomes });
    record('B2-S04-ENCODING-CROSSCHUNK', 1, outcomes.every((item) => item.ok) ? 'PASS' : 'FAIL', outcomes.map((item) => `${item.label}=${item.ok}`).join('; '));
  }

  async function streamLimits() {
    await bootstrap();
    await newConversation();
    const conv = await conversationId();
    const limit = await runPrompt('b2:s05-limit', 180000);
    const limitFrames = framesFromEvents(limit.events);
    const limitOrder = evaluateStreamOrder(limitFrames);
    const truncated = limitFrames.some((frame) => frame.truncated) || limit.events.some((e) => e.eventType === 'tool_end' && /trunc/i.test(JSON.stringify(eventData(e))));
    await sleep(400);
    await submit('b2:s05-secret');
    const secret = await observeUntil(async (evts) => evts.filter((e) => e.eventType === 'turn_completed' || e.eventType === 'turn_failed').length >= 2, 120000, 'secret');
    const snapJson = JSON.stringify(await snapshot());
    const allEvents = JSON.stringify((await events(conv, 1000)).events);
    const dom = await domState();
    const leaks = { events: secretLeak(allEvents, secretLiteral), dom: secretLeak(dom.present, secretLiteral), snapshot: secretLeak(snapJson, secretLiteral) };
    const secretFrames = framesFromEvents(secret.events).filter((frame) => frame.toolCallId !== (limitFrames[0] || {}).toolCallId);
    const produced = secretFrames.length > 0;
    record('B2-S05-LIMITS-SECRET-BACKPRESSURE', 1, truncated && produced && !leaks.events.leaked && !leaks.dom.leaked && !leaks.snapshot.leaked && leaks.events.checked ? 'PASS' : 'FAIL',
      `truncation_reported=${truncated}; secret_frames=${secretFrames.length}; leaks=${JSON.stringify({ events: leaks.events.leaked, dom: leaks.dom.leaked, snapshot: leaks.snapshot.leaked })}; secret_configured=${leaks.events.checked}`);
    await sleep(400);
    const baselineTree = myTree();
    await submit('b2:s05-cancel');
    await waitFor(async () => framesFromEvents((await events(conv, 1000)).events).some((frame) => /alive/.test(frame.text)), 90000, 'cancel target running');
    const midTree = myTree();
    await exec('document.getElementById("cancel-task").click(); true');
    const idle = await waitIdle(90000, 'cancelled');
    await sleep(1500);
    const afterTree = descendantsOf(wmicRows(), process.pid);
    const extra = newProcesses(baselineTree, afterTree);
    out('s05-limits-secret.json', { limit: { frames: limitFrames.length, order: limitOrder, truncated }, secret: { frames: secretFrames.length, leaks },
      cancel: { baseline_tree: baselineTree.length, mid_tree: midTree.length, after_tree: afterTree.length, new_processes_after_cancel: extra, status: idle.agentStatus } });
    record('B2-S05-LIMITS-SECRET-BACKPRESSURE', 2, limitOrder.ok && extra.length === 0 && midTree.length > baselineTree.length ? 'PASS' : 'FAIL',
      `limit_frames=${limitFrames.length}; sequence_ok=${limitOrder.ok}; tree=${baselineTree.length}->${midTree.length}->${afterTree.length}; new_processes_after_cancel=${extra.length}`);
  }

  async function auditStop() {
    await bootstrap();
    await newConversation();
    const conv = await conversationId();
    fs.writeFileSync(path.join(workspaceRoot, 'b2-hold.txt'), 'b2 audit read target\n', 'utf8');
    try {
      const db = openDb(false);
      try { db.exec("CREATE TRIGGER b2_audit_fail BEFORE INSERT ON a9_events WHEN NEW.event_type = 'turn_completed' BEGIN SELECT RAISE(FAIL, 'b2 injected audit failure'); END"); } finally { db.close(); }
    } catch (error) {
      record('B2-S03T-TERMINAL-AUDIT', 1, 'UNKNOWN', `audit failure could not be injected: ${String(error && error.message ? error.message : error).slice(0, 200)}`);
      return;
    }
    try {
      const c0 = await counters();
      await submit('b2:audit-three');
      await waitFor(async () => { const s = await snapshot(); return s.controls.canStop === false && s.agentStatus !== 'running' ? s : null; }, 120000, 'audit turn settled');
      await sleep(1500);
      const c1 = await counters();
      const evts = (await events(conv, 1000)).events;
      const turnId = lastTurnOf(evts);
      const starts = evts.filter((e) => e.turnId === turnId && e.eventType === 'tool_start').length;
      const completed = evts.some((e) => e.turnId === turnId && e.eventType === 'turn_completed');
      await submit('b2:s01');
      await sleep(4000);
      const c2 = await counters();
      const evts2 = (await events(conv, 1000)).events;
      const laterShell = evts2.filter((e) => e.eventType === 'tool_start' && eventData(e).toolName === 'shell').length;
      const dom = await domState();
      out('s03t-terminal-audit.json', { requests: { before: c0.requests, after_turn: c1.requests, after_next_submit: c2.requests }, tool_starts_in_turn: starts, turn_completed_persisted: completed,
        later_shell_dispatches: laterShell, outcome_text: dom.outcome, turn_status: turnStatus(turnId) });
      record('B2-S03T-TERMINAL-AUDIT', 1, starts === 3 && !completed && c2.requests === c1.requests && laterShell === 0 ? 'PASS' : 'FAIL',
        `tool_starts=${starts}; turn_completed_persisted=${completed}; requests=${c0.requests}->${c1.requests}->${c2.requests}; later_shell_dispatches=${laterShell}`);
    } finally {
      try { const db = openDb(false); try { db.exec('DROP TRIGGER IF EXISTS b2_audit_fail'); } finally { db.close(); } } catch (_error) { /* data root is disposable */ }
    }
  }

  // ---- Modes: session and background (p05) ---------------------------------------------------------------------------------------

  async function sessionBg() {
    await bootstrap();
    await newConversation();
    const conv = await conversationId();
    // S06 part 1: streamed rows survive refresh, paging and view return.
    const streamed = await runPrompt('b2:s02');
    const frames = framesFromEvents(streamed.events);
    const texts = frames.map((frame) => frame.text.trim()).filter(Boolean);
    await reloadRenderer();
    const afterRefresh = await domState();
    const onceEach = texts.map((text) => ({ text, count: afterRefresh.present.split(text).length - 1 }));
    const full = (await events(conv, 1000)).events;
    const pages = [];
    let before;
    for (let guard = 0; guard < 50; guard += 1) {
      const page = await events(conv, 3, before === undefined ? {} : { beforeEventId: before });
      if (page.events.length === 0) break;
      pages.push(page.events);
      before = page.events[0].eventId;
      if (!page.hasMore) break;
    }
    const paging = evaluatePaging(full, pages);
    const other = await newConversation();
    await activateConversation(conv);
    await sleep(1200);
    const afterReturn = await domState();
    const returned = texts.every((text) => afterReturn.present.includes(text));
    const part = { conversationId: conv, other_conversation: other, texts, once_each_after_refresh: onceEach, paging, view_return_ok: returned };
    out('s06-part1.json', part);

    // BG-01: three allowed, the fourth rejected.
    await newConversation();
    const convBg = await conversationId();
    await submit('b2:bg-three');
    await waitIdle(180000, 'bg-three turn');
    const bgEvents = (await events(convBg, 1000)).events;
    const starts = toolEndsFor(bgEvents, 'start_process');
    const failed = starts.filter(toolEndFailed);
    const snapBg = await snapshot();
    const active = snapBg.managedProcesses.filter((item) => ['running', 'starting'].includes(item.lastProbeStatus));
    out('bg01-limit.json', { start_process_ends: starts.map(summarizeToolEnd), failed: failed.length, active: active.map((item) => ({ handleId: item.handleId, status: item.lastProbeStatus })), total_facts: snapBg.managedProcesses.length });
    record('B2-BG-01-LIMIT-THREE', 1, starts.length === 4 && failed.length === 1 && active.length === 3 && snapBg.managedProcesses.length === 3 ? 'PASS' : 'FAIL',
      `start_process_ends=${starts.length}; rejected=${failed.length}; active_handles=${active.length}; handle_facts=${snapBg.managedProcesses.length}`);
    await stopAllManaged();

    // BG-02: owner, handle and cursor.
    await newConversation();
    const convCur = await conversationId();
    await submit('b2:bg-cursor');
    await waitIdle(180000, 'bg-cursor turn');
    const curEvents = (await events(convCur, 1000)).events;
    const reads = toolEndsFor(curEvents, 'read_process_output');
    const outcome = reads.map((event) => ({ failed: toolEndFailed(event), head: JSON.stringify(eventData(event)).slice(0, 220) }));
    out('bg02-ownership-cursor.json', { reads: outcome });
    const nextEntries = reads.length === 4 ? JSON.stringify(eventData(reads[3])) : '';
    record('B2-BG-02-OWNERSHIP-CURSOR', 1, reads.length === 4 && outcome[0].failed && outcome[1].failed && !outcome[2].failed && !outcome[3].failed && nextEntries.includes('entries') ? 'PASS' : 'FAIL',
      `reads=${reads.length}; failed_flags=${JSON.stringify(outcome.map((item) => item.failed))}`);
    await stopAllManaged();

    // BG-03: double stop, ready failure, release.
    await newConversation();
    const convStop = await conversationId();
    await submit('b2:bg-stop-twice');
    await waitIdle(180000, 'bg-stop turn');
    const stopEvents = (await events(convStop, 1000)).events;
    const stops = toolEndsFor(stopEvents, 'stop_process');
    const snapStop = await snapshot();
    await newConversation();
    const convFail = await conversationId();
    await submit('b2:bg-ready-fail');
    await waitIdle(180000, 'bg-ready-fail turn');
    const failEvents = (await events(convFail, 1000)).events;
    const startFail = toolEndsFor(failEvents, 'start_process');
    const snapFail = await snapshot();
    const residue = snapFail.managedProcesses.filter((item) => ['running', 'starting', 'running_unknown', 'identity_mismatch'].includes(item.lastProbeStatus) || item.cleanupRequired === true);
    out('bg03-stop-release.json', { stops: stops.map(summarizeToolEnd), after_stop_facts: snapStop.managedProcesses.map((item) => ({ handleId: item.handleId, status: item.lastProbeStatus, ownership: item.ownershipState })),
      ready_fail: startFail.map(summarizeToolEnd), residue_after_fail: residue.length });
    const stopsOk = stops.length === 2 && !toolEndFailed(stops[0]) && !/crash|exception|TypeError/i.test(JSON.stringify(eventData(stops[1])));
    const afterStopClean = snapStop.managedProcesses.every((item) => !['running', 'starting'].includes(item.lastProbeStatus));
    record('B2-BG-03-STOP-RELEASE-EXIT', 1, stopsOk && afterStopClean && startFail.length === 1 && residue.length === 0 ? 'PASS' : 'FAIL',
      `stop_calls=${stops.length}; second_stop_error=${stops[1] ? toolEndFailed(stops[1]) : 'n/a'}; clean_after_stop=${afterStopClean}; ready_fail_ends=${startFail.length}; residue=${residue.length}; exit_without_dialog=pending`);
  }
  async function stopAllManaged() {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const snap = await snapshot();
      if (!snap.managedProcesses.some((item) => ['running', 'starting', 'running_unknown'].includes(item.lastProbeStatus))) return;
      await exec('(() => { const b = document.getElementById("cancel-task"); if (b && !b.hidden) b.click(); return true; })()');
      await sleep(2500);
    }
    throw new Error('A9_BATCH2_DRIVER_MANAGED_STOP_INCOMPLETE');
  }

  async function sessionRestart() {
    const part = readJsonFile('s06-part1.json');
    await bootstrap();
    await activateConversation(part.conversationId);
    await sleep(1500);
    const dom = await domState();
    const frames = framesFromEvents((await events(part.conversationId, 1000)).events);
    const restartTexts = frames.map((frame) => frame.text.trim()).filter(Boolean);
    const sameRows = JSON.stringify(restartTexts) === JSON.stringify(part.texts);
    const once = part.texts.map((text) => ({ text, count: dom.present.split(text).length - 1 }));
    const refreshOnce = part.once_each_after_refresh.every((item) => item.count === 1);
    const restartOnce = once.every((item) => item.count === 1);
    out('s06-refresh-paging.json', { part1: part, restart: { rows_equal: sameRows, once_each: once }, refresh_once: refreshOnce, paging_ok: part.paging.ok, view_return_ok: part.view_return_ok });
    record('B2-S06-REFRESH-PAGING-RESTART', 1, refreshOnce && restartOnce && part.paging.ok && part.view_return_ok && sameRows ? 'PASS' : 'FAIL',
      `refresh_once=${refreshOnce}; paging=${part.paging.ok}; view_return=${part.view_return_ok}; restart_rows_equal=${sameRows}; restart_once=${restartOnce}`);
  }

  // ---- Modes: continue (p06) ----------------------------------------------------------------------------------------------------

  const continueInterrupt = () => interruptAt('approval', 'cont-interrupt-pre.json');
  const continueUnknownInterrupt = () => interruptAt('unknown_shell', 'cont-unknown-pre.json');

  async function continueRestart() {
    const pre = readJsonFile('cont-interrupt-pre.json');
    const facts = await recoverFacts(pre);
    const approvalResult = await oldApprovalResult(pre);
    const fileStillThere = fs.existsSync(path.join(workspaceRoot, 'b2-hold.txt'));
    const before = await counters();
    await setFixture({ afterHold: true, holdNext: false });
    const first = await exec(`(() => { const b = document.querySelector('section.continuation-card button'); if (!b) return 'no-card'; b.click(); b.click(); return 'double-clicked'; })()`);
    await waitIdle(120000, 'continued turn');
    const convEvents = (await events(pre.conversationId, 1000)).events;
    const requested = convEvents.filter((e) => e.eventType === 'task_continue_requested' && eventData(e).taskId === pre.taskId);
    const after = await counters();
    const newTurns = [...new Set(requested.map((e) => e.turnId))];
    const oldStatusAfter = turnStatus(pre.turnId);
    out('cont01-restart.json', { zero_added: zeroAdded(pre, facts), counters: { kill: pre.counters.requests, after_boot: facts.afterBoot.requests, after_refresh: facts.afterRefresh.requests, before_click: before.requests, after_settle: after.requests },
      double_click: first, continue_events: requested.length, new_turns: newTurns, old_turn_status: { before: facts.state2.turn, after: oldStatusAfter } });
    writeJson(path.join(attemptDir, 'cont03-part-approval.json'), { old_approval_ok: approvalResult && approvalResult.ok, old_approval_error: approvalResult && approvalResult.error && approvalResult.error.code, file_still_exists: fileStillThere });
    record('B2-CONT-01-RESTART-ZERO-REQUEST', 1, zeroAdded(pre, facts) && requested.length === 1 && newTurns.length === 1 ? 'PASS' : 'FAIL',
      `zero_added=${zeroAdded(pre, facts)}; double_click_continue_events=${requested.length}; new_turns=${newTurns.length}; (single click: see B2-CH-05-CONTINUE)`);
    record('B2-CONT-01-RESTART-ZERO-REQUEST', 2, facts.state2.turn === oldStatusAfter ? 'PASS' : 'FAIL', `old_turn_status_before=${facts.state2.turn}; after=${oldStatusAfter}`);
  }

  // CONT-03 second assertion, in-process part. The interrupted task is written into the candidate's own database the way the
  // A9-32 lifecycle tests do, because the guards under test judge persisted facts; the real crash chain is covered by p03 and
  // the other p06 modes. Nothing here sends a Provider request except the one explicit continue of the coexistence check.
  async function continueGuards() {
    const subs = [];
    const note = {};
    await bootstrap();
    await newConversation();
    const conv = await conversationId();
    const taskId = 'b2-guard-task';
    const oldTurn = 'b2-guard-old-turn';
    let residueHandle = null;
    try {
      // The healthy owned background process that must not block a continue.
      await submit('b2:bg-long');
      await waitIdle(120000, 'guard bg start turn');
      const bg = await waitFor(async () => (await snapshot()).managedProcesses.find((item) => item.lastProbeStatus === 'running') || null, 60000, 'healthy managed process');
      note.healthy_process = { handleId: bg.handleId, status: bg.lastProbeStatus, ownership: bg.ownershipState || null };
      const db = openDb(false);
      try { insertInterruptedTask(db, conv, taskId, oldTurn); } finally { db.close(); }
      const recovery = await waitFor(() => findRecovery(taskId), 20000, 'injected recovery fact');
      note.recovery = { canContinue: recovery.canContinue, blockedReason: recovery.blockedReason || null, interruptedTurnId: recovery.interruptedTurnId };
      const attempt = (identity) => exec(`window.win7Agent.a9.continueTask(${JSON.stringify(identity.conversationId)}, ${JSON.stringify(taskId)}, ${JSON.stringify(recovery.interruptedTurnId)}, ${JSON.stringify(identity.recoveryRevision)})`);
      const measured = async (identity) => {
        const c0 = await counters(); const e0 = (await continueEventsFor(conv, taskId)).length;
        const result = await attempt(identity);
        const c1 = await counters(); const e1 = (await continueEventsFor(conv, taskId)).length;
        return { result, requests: { before: c0.requests, after: c1.requests }, continueEvents: { before: e0, after: e1 } };
      };
      const good = { conversationId: recovery.conversationId, recoveryRevision: recovery.recoveryRevision };

      // Wrong owner: another conversation id.
      const wrong = await measured({ conversationId: 'b2-not-this-conversation', recoveryRevision: recovery.recoveryRevision });
      note.wrong_owner = { error: wrong.result && wrong.result.error && wrong.result.error.code, requests: wrong.requests, continue_events: wrong.continueEvents };
      subs.push(subResult('wrong_owner', guardRefused(wrong.result, 'A9_CONTINUE_IDENTITY_MISMATCH', wrong.requests, wrong.continueEvents),
        `error=${note.wrong_owner.error}; requests=${wrong.requests.before}->${wrong.requests.after}; continue_events=${wrong.continueEvents.before}->${wrong.continueEvents.after}`));

      // Revision drift: a well-formed but stale revision.
      const drift = await measured({ conversationId: recovery.conversationId, recoveryRevision: '0'.repeat(64) });
      note.revision_drift = { error: drift.result && drift.result.error && drift.result.error.code, requests: drift.requests, continue_events: drift.continueEvents };
      subs.push(subResult('revision_drift', guardRefused(drift.result, 'A9_CONTINUE_REVISION_MISMATCH', drift.requests, drift.continueEvents),
        `error=${note.revision_drift.error}; requests=${drift.requests.before}->${drift.requests.after}; continue_events=${drift.continueEvents.before}->${drift.continueEvents.after}`));

      // Residue: a persisted managed-process fact whose cleanup is not confirmed. The row is a copy of the candidate's own
      // fact shape with a pid that cannot exist, removed again before the coexistence check.
      const workspacePath = dbAll('SELECT workspace_path FROM a9_managed_processes LIMIT 1')[0].workspace_path;
      residueHandle = 'b2-injected-residue';
      const residueDb = openDb(false);
      try { insertResidueFact(residueDb, workspacePath, residueHandle); } finally { residueDb.close(); }
      await reloadRenderer();
      await activateConversation(conv);
      await waitFor(async () => (await domState()).cards > 0, 30000, 'blocked card');
      const blockedRecovery = await findRecovery(taskId);
      const blockedCard = await cardInfo();
      const blocked = await measured(good);
      note.residue = { recovery_blocked_reason: blockedRecovery && blockedRecovery.blockedReason, can_continue: blockedRecovery && blockedRecovery.canContinue,
        card_button_disabled: blockedCard && blockedCard.disabled, card_text_names_reason: Boolean(blockedCard && blockedCard.text.includes('A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED')),
        error: blocked.result && blocked.result.error && blocked.result.error.code, requests: blocked.requests, continue_events: blocked.continueEvents };
      subs.push(subResult('residue', Boolean(blockedRecovery) && blockedRecovery.canContinue === false && blockedRecovery.blockedReason === 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED'
        && Boolean(blockedCard) && blockedCard.disabled === true && note.residue.card_text_names_reason
        && guardRefused(blocked.result, 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED', blocked.requests, blocked.continueEvents),
      `reason=${note.residue.recovery_blocked_reason}; button_disabled=${note.residue.card_button_disabled}; error=${note.residue.error}; requests=${blocked.requests.before}->${blocked.requests.after}`));
      const cleanup = openDb(false);
      try { deleteResidueFact(cleanup, residueHandle); } finally { cleanup.close(); }
      residueHandle = null;

      // Coexistence: with the residue gone, the healthy owned process does not block one explicit continue.
      await reloadRenderer();
      await activateConversation(conv);
      await waitFor(async () => (await domState()).cards > 0, 30000, 'card after residue removal');
      const freeRecovery = await findRecovery(taskId);
      const freeCard = await cardInfo();
      const processBefore = (await snapshot()).managedProcesses.find((item) => item.handleId === bg.handleId);
      const requestsBefore = (await counters()).requests;
      await setFixture({ afterHold: true, holdNext: false });
      await clickContinue();
      await waitFor(async () => (await continueEventsFor(conv, taskId)).length >= 1, 30000, 'continue event');
      await waitIdle(120000, 'coexistence continue turn');
      const requestsAfter = (await counters()).requests;
      const continueEvents = await continueEventsFor(conv, taskId);
      const processAfter = (await snapshot()).managedProcesses.find((item) => item.handleId === bg.handleId);
      note.coexistence = { can_continue_before: freeRecovery && freeRecovery.canContinue, card_button_disabled: freeCard && freeCard.disabled, process_before: processBefore && processBefore.lastProbeStatus,
        process_after: processAfter && processAfter.lastProbeStatus, continue_events: continueEvents.length, requests: { before: requestsBefore, after: requestsAfter } };
      subs.push(subResult('healthy_owned_process_coexists', Boolean(freeRecovery) && freeRecovery.canContinue === true && Boolean(freeCard) && freeCard.disabled === false
        && continueEvents.length === 1 && requestsAfter > requestsBefore && Boolean(processBefore) && processBefore.lastProbeStatus === 'running' && Boolean(processAfter) && processAfter.lastProbeStatus === 'running',
      `can_continue=${note.coexistence.can_continue_before}; continue_events=${continueEvents.length}; requests=${requestsBefore}->${requestsAfter}; process=${note.coexistence.process_before}->${note.coexistence.process_after}`));
    } catch (error) {
      subs.push(subResult('guards_journey', null, `journey stopped before it finished: ${String(error && error.message ? error.message : error).slice(0, 300)}`));
    } finally {
      if (residueHandle) { try { const db = openDb(false); try { deleteResidueFact(db, residueHandle); } finally { db.close(); } } catch (_error) { /* data root is disposable */ } }
      try { await stopAllManaged(); } catch (error) { note.stop_all_error = String(error && error.message ? error.message : error).slice(0, 200); }
    }
    out('cont03-part-guards.json', { subs, note, injection: 'interrupted task rows and one cleanup_required managed-process row written into the candidate database; the row is removed again' });
  }

  // CONT-03 second assertion, mode part: an unreadable mode settings file must leave the real interrupted task blocked.
  async function continueModeGuard() {
    const pre = readJsonFile('cont-unknown-pre.json');
    const subs = [];
    const note = {};
    const found = findModeSettingsFile(dataRoot);
    note.settings_files = found.count;
    if (!found.file) {
      subs.push(subResult('mode_diagnostics', null, `expected exactly one mode settings file, found ${found.count}`));
      out('cont03-part-mode.json', { subs, note });
      return;
    }
    const file = found.file;
    const original = fs.readFileSync(file);
    try {
      await waitFor(() => exec('document.readyState === "complete"'), 30000, 'renderer ready');
      fs.writeFileSync(file, CORRUPT_MODE_SETTINGS, 'utf8');
      await selectWorkspace();
      const snap = await snapshot();
      note.mode_after_open = snap.mode === undefined ? 'undefined' : snap.mode;
      await activateConversation(pre.conversationId);
      const recovery = await waitFor(() => findRecovery(pre.taskId), 45000, 'recovery fact under unresolved mode');
      await reloadRenderer();
      await activateConversation(pre.conversationId);
      await waitFor(async () => (await domState()).cards > 0, 30000, 'blocked card');
      const card = await cardInfo();
      const c0 = await counters();
      const events0 = (await continueEventsFor(pre.conversationId, pre.taskId)).length;
      const result = await exec(`window.win7Agent.a9.continueTask(${JSON.stringify(recovery.conversationId)}, ${JSON.stringify(pre.taskId)}, ${JSON.stringify(recovery.interruptedTurnId)}, ${JSON.stringify(recovery.recoveryRevision)})`);
      const c1 = await counters();
      const events1 = await continueEventsFor(pre.conversationId, pre.taskId);
      note.recovery = { canContinue: recovery.canContinue, blockedReason: recovery.blockedReason || null };
      note.card = card;
      note.error = result && result.error && result.error.code;
      note.requests = { before: c0.requests, after: c1.requests };
      note.continue_events = events1.length;
      subs.push(subResult('mode_diagnostics', recovery.canContinue === false && recovery.blockedReason === 'A9_MODE_SELECTION_REQUIRED' && Boolean(card) && card.disabled === true
        && guardRefused(result, 'A9_MODE_SELECTION_REQUIRED', note.requests, { before: events0, after: events1.length }),
      `reason=${note.recovery.blockedReason}; button_disabled=${card && card.disabled}; error=${note.error}; requests=${c0.requests}->${c1.requests}; continue_events=${events1.length}`));
    } catch (error) {
      subs.push(subResult('mode_diagnostics', null, `journey stopped before it finished: ${String(error && error.message ? error.message : error).slice(0, 300)}`));
    } finally {
      try { fs.writeFileSync(file, original); note.settings_restored = true; } catch (error) { note.settings_restored = false; note.restore_error = String(error && error.message ? error.message : error).slice(0, 200); }
    }
    out('cont03-part-mode.json', { subs, note, corruption: 'the mode settings file was replaced by truncated JSON before the workspace was opened, then restored from its original bytes' });
  }

  async function continueUnknown() {
    const pre = readJsonFile('cont-unknown-pre.json');
    const approvalPart = readJsonFile('cont03-part-approval.json');
    const facts = await recoverFacts({ ...pre, counters: pre.counters });
    const unknownResults = Array.isArray(facts.recovery.unknownResults) ? facts.recovery.unknownResults : null;
    await setFixture({ afterHold: true, holdNext: false });
    const clickBase = (await counters()).requests;
    await clickContinue();
    await waitIdle(120000, 'continued unknown turn');
    const lines = providerLines().filter((entry) => entry.index > clickBase);
    const first = lines[0] || {};
    const delivered = unknownResults !== null && unknownResults.length > 0 && first.recovery_unknown_count === unknownResults.length;
    const readPart = (name) => { try { return readJsonFile(name); } catch (_error) { return null; } };
    const guards = readPart('cont03-part-guards.json');
    const modePart = readPart('cont03-part-mode.json');
    const subs = [...(guards ? guards.subs : [subResult('guards_part', null, 'cont03-part-guards.json missing')]),
      ...(modePart ? modePart.subs : [subResult('mode_part', null, 'cont03-part-mode.json missing')])];
    const verdict = summarizeSubs(subs);
    out('cont03-approval-unknown.json', { approval_part: approvalPart, unknown_results: unknownResults, first_request_unknown_count: first.recovery_unknown_count,
      guard_subs: subs, guards_note: guards && guards.note, mode_note: modePart && modePart.note });
    record('B2-CONT-03-APPROVAL-UNKNOWN-EFFECTS', 1, approvalPart.old_approval_ok === false && approvalPart.file_still_exists && delivered ? 'PASS' : 'FAIL',
      `old_approval_ok=${approvalPart.old_approval_ok}; file_still_exists=${approvalPart.file_still_exists}; unknown_results=${unknownResults && unknownResults.length}; first_request_unknown_count=${first.recovery_unknown_count}; (write/edit/delete effects: only Shell reachable)`);
    record('B2-CONT-03-APPROVAL-UNKNOWN-EFFECTS', 2, verdict.status, `${verdict.text}; (residue and the owned process use database-injected facts; mode diagnostics uses a truncated mode settings file)`);
  }

  // ---- Modes: safe rules (p07) ------------------------------------------------------------------------------------------------------

  async function safeRules() {
    await bootstrap();
    await newConversation();
    const conv = await conversationId();
    try {
      const db = openDb(false);
      try { db.exec("CREATE TRIGGER b2_audit_write BEFORE INSERT ON a9_events WHEN NEW.event_type = 'tool_end' BEGIN SELECT RAISE(FAIL, 'b2 injected audit failure'); END"); } finally { db.close(); }
    } catch (error) {
      record('B2-SAFE-02-AUDIT-HARD-STOP', 1, 'UNKNOWN', `audit failure could not be injected: ${String(error && error.message ? error.message : error).slice(0, 200)}`);
      return;
    }
    try {
      const c0 = await counters();
      await submit('b2:audit-write');
      await waitFor(async () => { const s = await snapshot(); return s.controls.canStop === false && s.agentStatus !== 'running' ? s : null; }, 120000, 'audit write settled');
      await sleep(1500);
      const c1 = await counters();
      const fileWritten = fs.existsSync(path.join(workspaceRoot, 'b2-audit.txt'));
      const evts = (await events(conv, 1000)).events;
      const turnId = lastTurnOf(evts);
      const toolEnds = evts.filter((e) => e.turnId === turnId && e.eventType === 'tool_end').length;
      const row = dbAll('SELECT status, outcome_json FROM a9_turns WHERE turn_id = ?', turnId)[0] || {};
      await submit('b2:s01');
      await sleep(4000);
      const c2 = await counters();
      const dom = await domState();
      out('safe02-audit-hard-stop.json', { file_written_on_disk: fileWritten, tool_end_events_persisted: toolEnds, turn_status: row.status || null, outcome_json: String(row.outcome_json || '').slice(0, 400),
        requests: { before: c0.requests, after_turn: c1.requests, after_next_submit: c2.requests }, outcome_text: dom.outcome });
      const auditFlag = /A9_AUDIT_PERSISTENCE_FAILED|auditIncomplete/.test(`${row.outcome_json || ''}${dom.present}`);
      record('B2-SAFE-02-AUDIT-HARD-STOP', 1, fileWritten && toolEnds === 0 && auditFlag && row.status !== 'completed' && c2.requests === c1.requests ? 'PASS' : 'FAIL',
        `file_written=${fileWritten}; tool_end_persisted=${toolEnds}; audit_flag_visible=${auditFlag}; turn_status=${row.status}; requests=${c0.requests}->${c1.requests}->${c2.requests}`);
    } finally {
      try { const db = openDb(false); try { db.exec('DROP TRIGGER IF EXISTS b2_audit_write'); } finally { db.close(); } } catch (_error) { /* data root is disposable */ }
    }
  }

  // ---- Modes: UI (p08) -------------------------------------------------------------------------------------------------------------

  // The prelude Turn gives the stream enough rows to scroll before the interruption is staged.
  const uiInterrupt = () => interruptAt('approval', 'ui-interrupt-pre.json', 'b2:s01');

  // B2-UI-01: one journey through the real DOM and real key events. Every step is observed; a step that cannot be reached
  // leaves its facts null so the assertion stays UNKNOWN instead of PASS.
  async function uiContinue() {
    const pre = readJsonFile('ui-interrupt-pre.json');
    const facts = { card0: null, enter: null, stopped: null, view_return: null, space: null };
    const notes = { errors: [] };
    const step = async (label, fn) => { try { await fn(); } catch (error) { notes.errors.push(`${label}: ${String(error && error.message ? error.message : error).slice(0, 240)}`); } };
    await bootstrap();
    await activateConversation(pre.conversationId);
    await waitFor(async () => (await domState()).cards > 0, 45000, 'continue card');
    const recovery0 = await findRecovery(pre.taskId);
    facts.card0 = await cardInfo();

    await step('enter_journey', async () => {
      win.setContentSize(1366, 520);
      await sleep(600);
      const scroll0 = await scrollProbe(true);
      await setFixture({ afterHold: true, holdNext: true });
      await exec(`(() => { const b = document.querySelector('section.continuation-card button'); b.focus({ preventScroll: true }); return document.activeElement === b; })()`);
      press('Enter');
      const busy = await waitFor(async () => { const c = await cardInfo(); return c && c.button === CARD_BUTTON_BUSY ? c : null; }, 8000, 'busy label').catch(() => null);
      await sleep(1200);
      const focus = await focusProbe();
      const scroll1 = await scrollProbe(false);
      const eventsBusy = await continueEventsFor(pre.conversationId, pre.taskId);
      press('Enter');
      press('Space');
      await sleep(800);
      const eventsExtra = await continueEventsFor(pre.conversationId, pre.taskId);
      await screenshot('ui01-interaction.png');
      facts.enter = { busy_label: Boolean(busy), button_disabled: busy ? busy.disabled === true : null, focus_in_card: focus.inCard, focus_element: focus.tag,
        scroll: scroll0 && scroll1 ? { testable: scroll0.height - scroll0.client >= 60, before: scroll0.top, after: scroll1.top, height: scroll0.height, client: scroll0.client } : null,
        continue_events_while_busy: eventsBusy.length, continue_events_after_extra_keys: eventsExtra.length };
    });

    await step('stop_journey', async () => {
      await exec('document.getElementById("cancel-task").click(); true');
      await waitIdle(60000, 'ui continue stopped');
      const card = await waitFor(async () => { const c = await cardInfo(); return c && c.disabled === false ? c : null; }, 30000, 'enabled card after stop');
      const focus = await focusProbe();
      const recovery1 = await findRecovery(pre.taskId);
      facts.stopped = { card, focus_in_card: focus.inCard, focus_element: focus.tag, interrupted_turn_changed: Boolean(recovery1) && recovery1.interruptedTurnId !== recovery0.interruptedTurnId,
        revision_changed: Boolean(recovery1) && recovery1.recoveryRevision !== recovery0.recoveryRevision, failure_text: card.text.slice(-200) };
    });

    await step('view_return', async () => {
      await newConversation();
      await activateConversation(pre.conversationId);
      await waitFor(async () => (await domState()).cards > 0, 30000, 'card after view return');
      facts.view_return = { card: await cardInfo() };
    });

    await step('space_retry', async () => {
      await setFixture({ afterHold: true, holdNext: false });
      await exec(`(() => { const b = document.querySelector('section.continuation-card button'); b.focus({ preventScroll: true }); return document.activeElement === b; })()`);
      press('Space');
      await waitFor(async () => (await continueEventsFor(pre.conversationId, pre.taskId)).length >= 2, 30000, 'second continue event');
      await waitIdle(120000, 'space retry turn');
      const all = await continueEventsFor(pre.conversationId, pre.taskId);
      const lastTurn = all.length ? all[all.length - 1].turnId : null;
      facts.space = { continue_events_total: all.length, ipc_continue_calls_total: continueIpcCalls(), second_turn_status: lastTurn ? turnStatus(lastTurn) : null, continue_turns: all.map((e) => e.turnId) };
    });
    win.setContentSize(1366, 768);

    const subs = evaluateUiJourney(facts);
    const verdict = summarizeSubs(subs);
    out('ui01-interaction.json', { facts, subs, notes, keyboard: 'Enter and Space via webContents.sendInputEvent (keyDown, char, keyUp)', window_height_for_scroll_test: 520 });
    record('B2-UI-01-CONTINUE-INTERACTION', 1, verdict.status, `${verdict.text}${notes.errors.length ? `; step_errors=${notes.errors.length}` : ''}`);
  }

  async function uiLayouts() {
    await bootstrap();
    await newConversation();
    const rows = [];
    for (const zoom of [1, 1.25]) {
      win.setContentSize(1366, 768);
      win.webContents.setZoomFactor(zoom);
      await sleep(600);
      for (const rail of [false, true]) {
        for (const inspector of [false, true]) {
          await exec(`(() => { const wb = document.querySelector('.workbench'); const want = ${rail}; if (wb && wb.classList.contains('rail-closed') === want) { const n = document.getElementById('open-navigation'); if (n) n.click(); }
            const ins = document.getElementById('inspector'); const open = ins && ins.classList.contains('open'); if (${inspector} !== Boolean(open)) { const t = document.getElementById(${inspector} ? 'open-inspector' : 'close-inspector'); if (t) t.click(); } return true; })()`);
          await sleep(500);
          const probe = await exec(`(() => {
            const ids = ['task-prompt', 'run-task', 'cancel-task'];
            const out = {};
            for (const id of ids) { const el = document.getElementById(id); if (!el) { out[id] = null; continue; } const r = el.getBoundingClientRect();
              const hit = r.width > 0 && r.height > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
              out[id] = { hidden: el.hidden || r.width === 0, inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight, reachable: Boolean(hit && (hit === el || el.contains(hit))) }; }
            return { innerWidth: window.innerWidth, innerHeight: window.innerHeight, controls: out };
          })()`);
          rows.push({ zoom, rail_closed: rail, inspector_open: inspector, ...probe });
        }
      }
    }
    win.setContentSize(1366, 600);
    win.webContents.setZoomFactor(1);
    await sleep(600);
    const shorter = await exec(`(() => { const el = document.getElementById('run-task'); const r = el.getBoundingClientRect(); return { innerHeight: window.innerHeight, inViewport: r.bottom <= window.innerHeight && r.top >= 0 }; })()`);
    win.setContentSize(1366, 768);
    await screenshot('ui02-layouts.png');
    const bad = rows.filter((row) => ['task-prompt', 'run-task'].some((id) => !row.controls[id] || row.controls[id].hidden || !row.controls[id].inViewport || !row.controls[id].reachable));
    out('ui02-layouts.json', { rows, shorter, below_800: 'NOT_VERIFIED', bad: bad.length });
    record('B2-UI-02-LAYOUTS-DPI', 1, bad.length === 0 && shorter.inViewport ? 'PASS' : 'FAIL', `layouts=${rows.length}; unusable=${bad.length}; shorter_window_run_in_viewport=${shorter.inViewport}; below_800=NOT_VERIFIED`);
  }

  // ---- Dispatcher ------------------------------------------------------------------------------------------------------------------
  const MODE_TABLE = {
    chain_a: chainA, chain_interrupt: chainInterrupt, chain_recover: chainRecover, chain_exit: chainExit,
    stream_live: streamLive, stream_encodings: streamEncodings, stream_limits: streamLimits, audit_stop: auditStop,
    session_bg: sessionBg, session_restart: sessionRestart,
    continue_guards: continueGuards, continue_interrupt: continueInterrupt, continue_restart: continueRestart, continue_unknown_interrupt: continueUnknownInterrupt,
    continue_mode_guard: continueModeGuard, continue_unknown: continueUnknown,
    safe_rules: safeRules, ui_interrupt: uiInterrupt, ui_continue: uiContinue, ui_layouts: uiLayouts,
  };

  // Pre-ready seams ---------------------------------------------------------------------------------------------------------------------
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspaceRoot] });
  const originalMessageBox = dialog.showMessageBox.bind(dialog);
  dialog.showMessageBox = async (...args) => {
    const options = args.find((item) => item && typeof item === 'object' && !item.webContents) || {};
    const entry = { shown_at: new Date().toISOString(), buttons: options.buttons, message: String(options.message || '').slice(0, 200), detail: String(options.detail || '').slice(0, 200), title: options.title };
    dialogLog.push(entry);
    marker('dialog-shown.marker', { pid: process.pid, ...entry });
    const result = await originalMessageBox(...args);
    entry.returned_at = new Date().toISOString();
    entry.response = result.response;
    if (onDialogReturned) onDialogReturned(entry);
    return result;
  };
  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => {
    if (typeof listener !== 'function' || String(channel) !== 'product:a9-request') return originalHandle(channel, listener);
    return originalHandle(channel, async (...args) => {
      const request = args[1] || {};
      const result = await listener(...args);
      ipcLog.push({ at: new Date().toISOString(), action: request.action, payload_keys: request.payload && typeof request.payload === 'object' ? Object.keys(request.payload).sort() : [],
        ok: result && result.ok, error: result && result.error ? String(result.error.code || '').slice(0, 80) : null, duplicate: result && result.continuation ? result.continuation.duplicate === true : undefined });
      return result;
    });
  };
  require(env.A9_BATCH2_PRODUCT_MAIN);

  const finish = async (error) => {
    if (ownsExit && !error) return;
    const payload = { schema_version: 1, mode: MODE, status: error ? 'ERROR' : 'DONE', error: error ? String(error && error.stack ? error.stack : error).slice(0, 1500) : null,
      assertions: results, evidence: evidenceIndex, ipc: ipcLog.slice(-200), dialogs: dialogLog, duration_ms: Date.now() - startedAt };
    try { writeJson(resultFile, payload); } catch (_error) { /* reported by the exit code */ }
    driverExitCode = error ? 1 : 0;
    process.exitCode = driverExitCode;
    app.quit();
  };
  app.on('will-quit', (event) => {
    if (driverExitCode === 0) return;
    event.preventDefault();
    setImmediate(() => app.exit(driverExitCode));
  });
  await app.whenReady();
  try {
    win = await waitFor(() => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('renderer/workbench.html')) || null, 45000, 'workbench window');
    const runner = MODE_TABLE[MODE];
    if (!runner) throw new Error(`A9_BATCH2_DRIVER_MODE_UNKNOWN:${MODE}`);
    await runner();
    await finish(null);
  } catch (error) {
    ownsExit = false;
    await finish(error);
  }
}

module.exports = {
  assertionId, eventData, framesFromEvents, evaluateStreamOrder, textsPerStream, evaluateDomAfterDb, evaluateLiveTick, secretLeak,
  descendantsOf, stillAlive, newProcesses, toolEndsFor, summarizeToolEnd, toolEndFailed, normalizeCrlf, combineStatus, evaluatePaging, sha256, EXIT_BUTTONS,
  subResult, summarizeSubs, guardRefused, evaluateUiJourney,
  insertInterruptedTask, insertResidueFact, deleteResidueFact, findModeSettingsFile, CORRUPT_MODE_SETTINGS,
};

if (process.versions.electron && process.env.A9_BATCH2_MODE) {
  runDriver().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(2);
  });
}
