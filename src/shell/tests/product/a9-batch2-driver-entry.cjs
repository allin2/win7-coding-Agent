'use strict';

/**
 * A9-33 batch2 product driver (WIN7-45 tentative, ADR-0155 Proposed).
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

// Supplemental inputs only; these do not extend the frozen 25-case formal contract.
function continuationSchemaCases() {
  const valid = ['schema-conversation', 'schema-task', 'schema-turn', 'a'.repeat(64)];
  const cases = [];
  for (let index = 0; index < 3; index += 1) {
    for (const [label, value] of [['empty', ''], ['null', null], ['number', 7], ['overlong', 'x'.repeat(257)]]) {
      const args = valid.slice(); args[index] = value;
      cases.push({ id: `identity-${index}-${label}`, args });
    }
  }
  for (const [label, value] of [['empty', ''], ['null', null], ['number', 7], ['short', 'a'.repeat(63)], ['nonhex', 'G'.repeat(64)]]) {
    const args = valid.slice(); args[3] = value;
    cases.push({ id: `revision-${label}`, args });
  }
  return cases;
}

function continuationRequestFacts(request) {
  return { schema_version: request.schemaVersion, payload_sha256: sha256(JSON.stringify(request.payload) || '<undefined>') };
}

function evaluateContinuationSchema(observations, requests) {
  const cases = continuationSchemaCases();
  return observations.length === cases.length && requests.length === cases.length && cases.every((item, index) => {
    const response = observations[index]; const request = requests[index];
    const [conversationId, taskId, interruptedTurnId, recoveryRevision] = item.args;
    const expected = continuationRequestFacts({ schemaVersion: 7, payload: { conversationId, taskId, interruptedTurnId, recoveryRevision } });
    return response.id === item.id && response.ok === false && response.code === 'A9_PAYLOAD_INVALID'
      && request.action === 'a9.task.continue' && request.schema_version === 7 && request.ok === false && request.error === 'A9_PAYLOAD_INVALID'
      && JSON.stringify(request.payload_keys) === JSON.stringify(['conversationId', 'interruptedTurnId', 'recoveryRevision', 'taskId'])
      && request.payload_sha256 === expected.payload_sha256;
  });
}

function supplementalRowsFacts(rows) {
  if (rows.length > 1000) throw new Error('A2_M4_DATABASE_ROW_LIMIT');
  const bytes = JSON.stringify(rows);
  if (Buffer.byteLength(bytes, 'utf8') > 1024 * 1024) throw new Error('A2_M4_DATABASE_BYTE_LIMIT');
  return { rows: rows.length, sha256: sha256(bytes) };
}

function journeyToolFacts(events, workspace) {
  const starts = new Map(); const facts = [];
  const paths = /^[A-Za-z]:/.test(workspace) ? path.win32 : path;
  const canonical = (value) => paths.resolve(workspace, value).replace(/\\/g, '/').toLowerCase();
  for (const event of events) {
    const data = eventData(event);
    if (event.eventType === 'tool_start') starts.set(data.callId, { ...data, eventId: event.eventId });
    if (event.eventType !== 'tool_end') continue;
    const start = starts.get(data.callId);
    if (!start || start.toolName !== data.toolName || !start.args) continue;
    facts.push({ eventId: event.eventId, startId: start.eventId, tool: data.toolName, callId: data.callId,
      command: typeof start.args.command === 'string' ? start.args.command.trim().replace(/\s+/g, ' ') : null,
      cwd_matches: canonical(start.args.cwd || workspace) === canonical(workspace),
      path: typeof start.args.path === 'string' ? paths.relative(workspace, paths.resolve(workspace, start.args.path)).replace(/\\/g, '/') : null,
      shell: data.shell || null, result: data.result });
  }
  return facts;
}
function journeyShellChecks(events, workspace, command) {
  return journeyToolFacts(events, workspace).filter((f) => f.tool === 'shell' && f.command === command && f.cwd_matches && f.shell
    && f.shell.timedOut !== true && f.shell.truncated !== true && f.shell.processTreeReaped === true && Number.isInteger(f.shell.exitCode));
}
function journeyReadCitations(events, workspace, modelText, source, otherSources = {}) {
  const expected = { ...otherSources, 'calc.py': source };
  const reads = new Set(journeyToolFacts(events, workspace).filter((f) => {
    if (f.tool !== 'read' || typeof f.result !== 'string' || typeof expected[f.path] !== 'string') return false;
    try {
      const result = JSON.parse(f.result);
      return !result.error && result.path === f.path && result.isText === true && result.outsideWorkspace === false && result.truncated === false
        && result.startLine === 1 && result.linesRead === expected[f.path].replace(/\r\n/g, '\n').split('\n').length
        && result.totalLines === result.linesRead && result.content === expected[f.path].replace(/\r\n/g, '\n').split('\n').map((line, n) => `${n + 1}: ${line}`).join('\n')
        && result.contentSha256 === sha256(Buffer.from(expected[f.path], 'utf8'));
    } catch (_error) { return false; }
  }).map((f) => f.path));
  const matches = [...String(modelText).matchAll(/\bcalc\.py:(\d+)\b/g)];
  const lines = source.split(/\r?\n/); const compact = String(modelText).replace(/\s/g, '');
  const explanation = compact.includes('add应做加法，实际做减法');
  const references = matches.map((match, n) => {
    const line = Number(match[1]); const content = lines[line - 1] || null;
    const section = String(modelText).slice(match.index + match[0].length, matches[n + 1]?.index).replace(/\s/g, '');
    return { path: 'calc.py', line, content, matched: Boolean(content && section.includes(content.replace(/\s/g, ''))) };
  });
  const quotedLines = references.length > 0 && references.every((r) => Number.isSafeInteger(r.line) && r.line >= 1 && r.line <= 2 && r.matched);
  return { explanation, quoted_lines: quotedLines, reads: [...reads], references,
    ok: explanation && quotedLines && ['AGENTS.md', 'README.md', 'calc.py'].every((name) => reads.has(name))
      && references.some((r) => r.line === 1) && references.some((r) => r.line === 2) };

}

function supplementalReadOnlyFacts(turns, rows, absent) {
  const tools = ['write', 'shell', 'start_process'];
  const attempts = tools.map((name, n) => {
    const prompt = 'a2-readonly:' + name; const observed = rows.filter((r) => !r.probe && r.prompt === prompt && r.prompt_sha256 === sha256(prompt));
    const issued = observed.some((r) => r.tool_messages === 0 && r.issued_tool === name);
    const rejected = observed.some((r) => r.tool_messages === 1 && r.rejections?.some((v) => v.tool === name
      && v.call_id === 'a2-' + sha256(prompt).slice(0, 8) + '-0' && v.kind === 'unavailable_read_only'));
    const noExecution = Array.isArray(turns[n]?.events) && !turns[n].events.some((e) => ['tool_start', 'tool_end'].includes(e.eventType));
    return { tool: name, issued, rejected, no_execution: noExecution };
  });
  return { absent, attempts, ok: absent === true && turns.length === 3 && attempts.every((a) => a.issued && a.rejected && a.no_execution) };
}

function supplementalWorkspaceFacts(root) {
  const files = [];
  const visit = (directory, depth) => {
    if (depth > 8) throw new Error('A2_M4_WORKSPACE_DEPTH_LIMIT');
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= 128) throw new Error('A2_M4_WORKSPACE_ENTRY_LIMIT');
      const absolute = path.join(directory, item.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (item.isSymbolicLink()) throw new Error('A2_M4_WORKSPACE_LINK_REFUSED');
      if (item.isDirectory()) { files.push({ path: relative, kind: 'directory' }); visit(absolute, depth + 1); }
      else if (item.isFile()) {
        const stat = fs.statSync(absolute);
        if (stat.size > 1024 * 1024) throw new Error('A2_M4_WORKSPACE_FILE_LIMIT');
        files.push({ path: relative, kind: 'file', mode: stat.mode, bytes: stat.size, sha256: sha256(fs.readFileSync(absolute)) });
      } else throw new Error('A2_M4_WORKSPACE_ENTRY_REFUSED');
    }
  };
  visit(root, 0);
  return files;
}

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

// samples: [{ t, domFrameTexts, domTokens, dbFrameTexts, ipcEventIds, dbEventIds, domReadEndMs }]. DOM and IPC are read before the DB
// in each sample. domFrameTexts are the frames that were persisted by the end of the observation and were visible in this sample's
// DOM read (so a frame shown before the DB could answer for it is not filtered away); domTokens are the fixture output tokens the
// stream area showed, which also catches output that never reached the DB. persisted: [{ text, persistedAtMs }] from the stored
// event timestamps. A frame is displayed before it was persisted when every stored copy of its text has a stored timestamp later
// than the end of a DOM read that already showed it. The check cannot prove order for frames with no timestamp: those are counted
// as unchecked and the answer stays UNKNOWN. A sample with nothing to show proves nothing; at least one frame must be seen.
// The fixture output tokens: tick (S01), out and err (S02). A token the stream area showed that the database never held is a ghost frame.
const OUTPUT_TOKEN_PATTERN = /\b(?:tick|out|err) \d+\b/g;
// A displayed token counts as stored only when the stored text holds it as a whole token: the character before it is not a letter
// and the one after it is not a digit ("out 9" is not in "out 99"). Frames are joined without a separator, so a digit before is
// allowed. A token that ends the stored text may still be growing, so it counts.
function storedHasToken(text, token) {
  let at = text.indexOf(token);
  while (at !== -1) {
    const before = at === 0 ? '' : text[at - 1];
    const after = text[at + token.length];
    if (!/[A-Za-z_]/.test(before) && (after === undefined || !/\d/.test(after))) return true;
    at = text.indexOf(token, at + 1);
  }
  return false;
}
function evaluateDomAfterDb(samples, persisted) {
  const violations = [];
  let seen = 0;
  let unchecked = 0;
  let tied = 0;
  const stored = Array.isArray(persisted) ? persisted : null;
  for (const sample of samples) {
    const dbJoined = (sample.dbFrameTexts || []).join('');
    for (const text of sample.domFrameTexts || []) {
      seen += 1;
      if (!(sample.dbFrameTexts || []).includes(text)) violations.push({ t: sample.t, kind: 'dom', text: String(text).slice(0, 60) });
      if (stored && Number.isFinite(sample.domReadEndMs)) {
        const copies = stored.filter((item) => item.text === text);
        const stamps = copies.map((item) => item.persistedAtMs).filter(Number.isFinite);
        if (copies.length === 0 || stamps.length === 0) unchecked += 1;
        else {
          // The stored time is a millisecond wall clock taken before the INSERT. A time later than the end of a DOM read that already
          // showed the frame proves display came first; an earlier time does not by itself prove the commit preceded the display
          // (the later-database check above covers frames that never arrived), and the same millisecond proves nothing either way.
          const first = Math.min(...stamps);
          if (first > sample.domReadEndMs) violations.push({ t: sample.t, kind: 'displayed_before_persisted', text: String(text).slice(0, 60), persistedAtMs: first, domReadEndMs: sample.domReadEndMs });
          else if (first === sample.domReadEndMs) tied += 1;
        }
      }
    }
    for (const token of sample.domTokens || []) {
      seen += 1;
      if (!storedHasToken(dbJoined, token)) violations.push({ t: sample.t, kind: 'dom_token', text: token });
    }
    for (const id of sample.ipcEventIds || []) {
      seen += 1;
      if (!(sample.dbEventIds || []).includes(id)) violations.push({ t: sample.t, kind: 'ipc', eventId: id });
    }
  }
  const complete = violations.length === 0 && seen > 0;
  return { ok: complete && unchecked === 0 && tied === 0 ? true : violations.length > 0 ? false : null, samples: samples.length, observations: seen, unchecked_without_timestamp: unchecked, tied_same_millisecond: tied,
    persisted_timestamps_used: Boolean(stored), violations: violations.slice(0, 5) };
}
// firstTickVisibleMs and commandEndedMs are driver-clock offsets; the contract needs the first tick at least 1 s earlier.
function evaluateLiveTick(firstTickVisibleMs, commandEndedMs, minimumLeadMs) {
  const need = minimumLeadMs === undefined ? 1000 : minimumLeadMs;
  if (!Number.isFinite(firstTickVisibleMs) || !Number.isFinite(commandEndedMs)) return { ok: false, lead_ms: null, required_ms: need, reason: 'missing observation' };
  const lead = commandEndedMs - firstTickVisibleMs;
  return { ok: lead >= need, lead_ms: lead, required_ms: need };
}
// A background command returns to the model at once, so its Turn completes before the first output frame is stored (rehearsal 2 on Win7:
// the Turn completed 13 ms after the tool ended, the first tick was stored 451 ms after the Turn). The Turn end alone must not close the observation;
// it only counts after the grace period, so a command that never writes still ends the observation with 0 frames.
const BACKGROUND_FRAMES_NEEDED = 6;
const BACKGROUND_TURN_END_GRACE_MS = 8000;
function backgroundObservationDone(frameCount, turnEnded, elapsedMs) {
  return frameCount >= BACKGROUND_FRAMES_NEEDED || (turnEnded === true && elapsedMs >= BACKGROUND_TURN_END_GRACE_MS);
}
// KL-3 (rehearsal 3 on Win7): once the Turn that started a background process has ended, the renderer no longer refreshes the conversation,
// so the output frames reach SQLite and the IPC snapshot but not the page until the next refresh. B2-CH-02-A01 therefore asserts the stored
// and snapshot facts while the process runs; whether the page shows them is recorded (dom_frames_max) and not asserted. B2-S01 keeps the page
// check for a command that runs inside an active Turn.
function evaluateBackgroundOutput(samples, runningCount, stdoutText, stderrText) {
  const list = Array.isArray(samples) ? samples : [];
  const firstIpc = list.find((sample) => Array.isArray(sample.ipcEventIds) && sample.ipcEventIds.length > 0 && sample.frames > 0);
  const domFramesMax = list.reduce((max, sample) => Math.max(max, Array.isArray(sample.domFrameTexts) ? sample.domFrameTexts.length : 0), 0);
  const ipcFramesMax = list.reduce((max, sample) => Math.max(max, Array.isArray(sample.ipcEventIds) ? sample.ipcEventIds.length : 0), 0);
  const hasTick = /tick \d/.test(String(stdoutText));
  const hasErr = /err \d/.test(String(stderrText));
  return { ok: Boolean(firstIpc) && runningCount === 1 && hasTick && hasErr, first_ipc_ms: firstIpc ? firstIpc.t : null,
    ipc_frames_max: ipcFramesMax, dom_frames_max: domFramesMax, stdout_has_tick: hasTick, stderr_has_err: hasErr };
}
function secretLeak(text, secret) {
  const value = String(text || '');
  const needle = String(secret || '');
  if (!needle) return { leaked: false, checked: false };
  return { leaked: value.includes(needle) || value.includes(needle.slice(0, 10)), checked: true };
}
// S05 first assertion. A key that the product process does not know cannot be hidden by it, so the leak check decides nothing then
// (UNKNOWN, not PASS or FAIL): a leak-free output proves nothing when no secret was registered (rehearsal 6 review, round 1).
function evaluateSecretCheck(input) {
  const leaks = input.leaks || {};
  const leaked = ['events', 'dom', 'snapshot'].some((name) => !leaks[name] || leaks[name].leaked !== false);
  const decided = input.key_available === true && Boolean(leaks.events && leaks.events.checked);
  return { decided, clean: !leaked, status: !decided ? 'UNKNOWN' : input.truncated === true && input.produced === true && !leaked ? 'PASS' : 'FAIL' };
}
const WMI_STAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(\d{6})([+-]\d{3})$/;
// Microseconds since the epoch (UTC) of a WMI date-time stamp such as 20261015082741.448520+480, or null for any other text.
function wmiStampMicros(stamp) {
  const match = WMI_STAMP.exec(String(stamp || '').trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  return (Date.UTC(year, month - 1, day, hour, minute, second) - Number(match[8]) * 60000) * 1000 + Number(match[7]);
}
// WMI keeps the ParentProcessId of a process whose parent has exited, so a process that has run for days can name the pid that a new product
// process is given later (rehearsal 11, p03: the explorer.exe of another session, created 2026-09-24, named the pid of the new helper and
// counted as its child and as a survivor of the exit). A child cannot be created before its parent: a link whose child stamp is earlier
// than the parent stamp is stale and is left out, with its subtree. Stamps that cannot be read decide nothing and keep the link.
// The optional `stale` array receives the links that were left out.
function descendantsOf(rows, rootPid, stale) {
  const children = new Map();
  for (const row of rows) {
    const parent = Number(row.ParentProcessId);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(row);
  }
  const root = Number(rootPid);
  const rootRow = rows.find((row) => Number(row.ProcessId) === root);
  const out = [];
  const stack = [{ pid: root, micros: wmiStampMicros(rootRow && rootRow.CreationDate) }];
  const seen = new Set([root]);
  while (stack.length) {
    const parent = stack.pop();
    for (const child of children.get(parent.pid) || []) {
      const pid = Number(child.ProcessId);
      if (seen.has(pid)) continue;
      const micros = wmiStampMicros(child.CreationDate);
      if (parent.micros !== null && micros !== null && micros < parent.micros) {
        if (Array.isArray(stale)) stale.push({ pid, parent: parent.pid, name: child.Name, created: child.CreationDate || '' });
        continue;
      }
      seen.add(pid);
      out.push({ pid, parent: Number(child.ParentProcessId), name: child.Name, created: child.CreationDate || '' });
      stack.push({ pid, micros });
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
// A product tool_end carries its result as an escaped JSON string in data.result (rehearsal 4: {"toolName":"start_process","step":4,"result":"{\n  \"status\": \"failed\", ...}"}),
// so status and error code are read from the parsed result. A result that is not JSON is plain text.
function toolEndResult(event) {
  const raw = eventData(event).result;
  if (raw && typeof raw === 'object') return { parsed: raw, text: JSON.stringify(raw) };
  if (typeof raw !== 'string') return { parsed: null, text: '' };
  try {
    const parsed = JSON.parse(raw);
    return { parsed: parsed && typeof parsed === 'object' ? parsed : null, text: raw };
  } catch (_error) { return { parsed: null, text: raw }; }
}
const FAILED_RESULT_STATUS = /^(error|failed|rejected)$/;
const isFailedStatus = (value) => typeof value === 'string' && FAILED_RESULT_STATUS.test(value);
const errorCodeOf = (value) => (value ? String(value.code || value).slice(0, 80) : null);
function summarizeToolEnd(event) {
  const data = eventData(event);
  const result = toolEndResult(event);
  const parsed = result.parsed;
  return { eventId: event.eventId, toolName: data.toolName, ok: data.ok === undefined ? null : data.ok, error: errorCodeOf(data.error) || (parsed ? errorCodeOf(parsed.error) : null),
    result_status: parsed && typeof parsed.status === 'string' ? parsed.status : null, failed: toolEndFailed(event), result_head: result.text.slice(0, 300), head: JSON.stringify(data).slice(0, 200) };
}
function toolEndFailed(event) {
  const data = eventData(event);
  if (data.ok === false || Boolean(data.error) || isFailedStatus(data.status)) return true;
  const result = toolEndResult(event);
  // A structured result is judged by its own fields only: command output nested in it must not be mistaken for a tool failure.
  if (result.parsed) return result.parsed.ok === false || Boolean(result.parsed.error) || isFailedStatus(result.parsed.status);
  return /A9_[A-Z_]*(INVALID|LIMIT|OWNER|EXPIRED|REJECT|UNKNOWN)/.test(result.text);
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
// Counters that are not integers were not observed: the answer is null (UNKNOWN), never "unchanged" (undefined === undefined).
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
function guardRefused(result, code, requests, continueEvents) {
  if (!requests || !continueEvents || !isCount(requests.before) || !isCount(requests.after) || !isCount(continueEvents.before) || !isCount(continueEvents.after)) return null;
  return Boolean(result) && result.ok === false && Boolean(result.error) && result.error.code === code
    && requests.before === requests.after && continueEvents.before === continueEvents.after;
}
// Joins a base condition with a guard answer: an unobserved guard keeps the sub-journey UNKNOWN unless the base already fails.
// A stopped continuation turn is retryable: the product stores task, turn and run as `interrupted` (persistTurnResult) and shows a new enabled card.
// Only `interrupted` yields a recovery fact, so `cancelled` is never accepted as retryable.
const retryableStopStatus = (status) => status === 'interrupted';
// After Stop the same task must offer a new continuation: still continuable, another interrupted turn, another revision.
// A missing fact is null (UNKNOWN); a recovery task that cannot continue is false.
function stopLeavesActionableCard(before, after) {
  if (!before || !after || !before.interruptedTurnId || !before.recoveryRevision) return null;
  if (after.canContinue === false) return false;
  if (after.canContinue !== true || !after.interruptedTurnId || !after.recoveryRevision) return null;
  return after.interruptedTurnId !== before.interruptedTurnId && after.recoveryRevision !== before.recoveryRevision;
}
const statusOf = (value) => (value === null || value === undefined ? 'UNKNOWN' : value ? 'PASS' : 'FAIL');
function withGuard(base, refused) { return base === false || refused === false ? false : refused === null || base === null ? null : true; }
// Persisted-fact writers shared by the guard journeys and their runtime-backed tests. They write the same rows the A9-32
// lifecycle tests write, into the candidate's own database, and nothing else.
const GUARD_STAMP = '2026-01-01T00:00:00.000Z';
const RESIDUE_PID = 2147483000;
function insertInterruptedTask(db, conversation, taskId, oldTurnId, goal = 'b2 guard continue') {
  db.prepare("INSERT INTO a9_tasks(task_id,session_id,status,created_at,updated_at) VALUES(?,?,'interrupted',?,?)").run(taskId, conversation, GUARD_STAMP, GUARD_STAMP);
  db.prepare("INSERT INTO a9_turns(turn_id,task_id,session_id,status,outcome_json,created_at,updated_at) VALUES(?,?,?,'interrupted','{}',?,?)").run(oldTurnId, taskId, conversation, GUARD_STAMP, GUARD_STAMP);
  db.prepare("INSERT INTO a9_events(session_id,turn_id,kind,event_type,payload_json,created_at) VALUES(?,NULL,'model','conversation.request',?,?)")
    .run(conversation, JSON.stringify({ taskId, requestPrompt: goal }), GUARD_STAMP);
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
// B2-UI-02 verdict from the layout probes. A control is usable when it is visible, inside the viewport and not covered; the continuation
// card button must also be enabled. No rows, or no continuation card in some layout, leaves the case UNKNOWN unless a base control already fails.
// Rows are the probed pane layouts. A row whose pane state is not the wanted one was not the layout it claims (null → never PASS).
// An open drawer is a modal overlay (inspector below 1200 px, rail below 800 px): its backdrop covers the composer by design, so such a row is judged by
// the drawer's close control; the composer and the continuation card are judged in the rows where no drawer is open.
function evaluateUiLayouts(rows, shorter, cardFacts) {
  const list = Array.isArray(rows) ? rows : [];
  const usable = (item) => Boolean(item) && !item.hidden && item.inViewport === true && item.reachable === true;
  const cardUsable = (item) => usable(item) && item.disabled === false;
  const drawerRows = list.filter((row) => row.drawer_open === true);
  const dockedRows = list.filter((row) => row.drawer_open !== true);
  const badDocked = dockedRows.filter((row) => ['task-prompt', 'run-task'].some((id) => !usable(row.controls && row.controls[id])));
  const badDrawer = drawerRows.filter((row) => !usable(row.controls && row.controls.drawer_close));
  const bad = [...badDocked, ...badDrawer];
  const cardBad = dockedRows.filter((row) => !cardUsable(row.controls && row.controls.card_button));
  const stateUnobserved = list.filter((row) => row.pane_state_ok !== true);
  const shorterCard = shorter && shorter.card_button ? shorter.card_button : null;
  const shorterCardOk = Boolean(shorterCard) && shorterCard.inViewport === true && shorterCard.reachable === true && shorterCard.disabled === false;
  const cardObserved = Boolean(cardFacts && cardFacts.card_found) && dockedRows.length > 0 && dockedRows.every((row) => row.controls && row.controls.card_button) && Boolean(shorterCard);
  const baseOk = list.length > 0 && bad.length === 0 && Boolean(shorter) && shorter.inViewport === true;
  const status = list.length > 0 && !baseOk || (cardObserved && (cardBad.length > 0 || !shorterCardOk)) ? 'FAIL'
    : baseOk && cardObserved && stateUnobserved.length === 0 ? 'PASS' : 'UNKNOWN';
  return { status, bad: bad.length, card_bad: cardBad.length, card_observed: cardObserved, shorter_card_ok: shorterCardOk, base_ok: baseOk, drawer_rows: drawerRows.length, docked_rows: dockedRows.length, state_unobserved: stateUnobserved.length };
}
function evaluateUiJourney(f) {
  const facts = f || {};
  const card0 = facts.card0 || null;
  const enter = facts.enter || null;
  const stopped = facts.stopped || null;
  const back = facts.view_return || null;
  const space = facts.space || null;
  const scroll = enter && enter.scroll ? enter.scroll : null;
  // The two Enter-dependent assertions are judged only when the page saw a real Enter keypress that went to the button (codex round 4: the page body would
  // also have counted); otherwise the input never arrived where it was meant to and the answer is UNKNOWN.
  const delivery = enter && enter.enter_delivery ? enter.enter_delivery : null;
  const enterReached = delivery ? delivery.delivered === true && delivery.keydown_target === 'BUTTON' && enter.button_focused === true : null;
  const deliveryText = delivery ? `; enter_delivered=${delivery.delivered}; keydown=${delivery.keydown}; keypress13=${delivery.keypress}; keydown_target=${delivery.keydown_target}; button_focused=${enter.button_focused}; page_focused=${delivery.page_focused}` : '; enter delivery not observed';
  // The repeated-input challenge only counts when the extra Enter and the extra Space were seen by the page (their keydown); a disabled button need not click.
  const extraEnter = enter && enter.extra_enter ? enter.extra_enter : null;
  const extraSpace = enter && enter.extra_space ? enter.extra_space : null;
  const extrasReached = extraEnter && extraSpace ? extraEnter.keydown === true && extraSpace.keydown === true : null;
  const extraText = `; extra_enter_keydown=${extraEnter ? extraEnter.keydown : 'not observed'}; extra_space_keydown=${extraSpace ? extraSpace.keydown : 'not observed'}`;
  const subs = [];
  subs.push(subResult('card_ready', card0 ? card0.button === CARD_BUTTON_READY && card0.disabled === false : null, card0 ? `button=${card0.button}; disabled=${card0.disabled}` : 'no card observed'));
  subs.push(subResult('loading_feedback', enter && enterReached === true ? enter.busy_label === true && enter.button_disabled === true : null,
    enter ? `busy_label=${enter.busy_label}; button_disabled=${enter.button_disabled}${deliveryText}` : 'Enter journey not observed'));
  subs.push(subResult('focus_stays_on_card_while_busy', enter && enter.focus_in_card !== null && enter.focus_in_card !== undefined ? enter.focus_in_card === true : null,
    enter ? `focus_in_card=${enter.focus_in_card}` : 'Enter journey not observed'));
  subs.push(subResult('no_scroll_theft', scroll && scroll.testable === true ? Math.abs(Number(scroll.after) - Number(scroll.before)) <= 2 : null,
    scroll ? `testable=${scroll.testable}; before=${scroll.before}; after=${scroll.after}` : 'scroll not observed'));
  // Two continue events are a duplicate dispatch whatever the extra keys did (codex round 5, R3): the counts are judged first, and the key evidence only
  // decides whether a count of one may be signed PASS.
  const dispatchCounts = Boolean(enter) && Number.isSafeInteger(enter.continue_events_while_busy) && Number.isSafeInteger(enter.continue_events_after_extra_keys);
  const duplicateSeen = dispatchCounts && (enter.continue_events_while_busy > 1 || enter.continue_events_after_extra_keys > 1);
  subs.push(subResult('one_dispatch_while_busy', duplicateSeen ? false : dispatchCounts && enterReached === true && extrasReached === true
    ? enter.continue_events_while_busy === 1 && enter.continue_events_after_extra_keys === 1 : null,
  enter ? `events_busy=${enter.continue_events_while_busy}; events_after_extra_keys=${enter.continue_events_after_extra_keys}${deliveryText}${extraText}` : 'Enter journey not observed'));
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

// Key input as the page must see it (rehearsal 7, B2-UI-01). A `char` event carries the typed character: a native button is activated by a
// keypress with char code 13 (Enter) or by the keyup of the Space key. The first Enter of rehearsal 7 produced no click in 9.96 s; why is
// UNKNOWN, so every press is checked on the page side and an Enter that did not arrive as a real keypress leaves the verdict UNKNOWN.
const KEY_CHARS = { Enter: '\r', Space: ' ' };
const KEY_NAMES = { Enter: 'Enter', Space: ' ' };
const KEY_CHAR_CODES = { Enter: 13, Space: 32 };
function keyEventsFor(key) {
  if (!Object.prototype.hasOwnProperty.call(KEY_CHARS, key)) throw new Error(`A9_BATCH2_DRIVER_KEY_UNKNOWN:${key}`);
  return ['keyDown', 'char', 'keyUp'].map((type) => ({ type, keyCode: type === 'char' ? KEY_CHARS[key] : key }));
}
// What the page saw of one press: `records` is the page-side recorder list, `fromIndex` its length before the press.
function summarizeKeyPress(records, fromIndex, key) {
  const list = Array.isArray(records) ? records.slice(Number.isSafeInteger(fromIndex) && fromIndex > 0 ? fromIndex : 0) : [];
  const name = KEY_NAMES[key];
  const has = (type, test) => list.some((item) => Boolean(item) && item.type === type && test(item));
  const keydown = has('keydown', (item) => item.key === name);
  const keypress = has('keypress', (item) => item.charCode === KEY_CHAR_CODES[key]);
  const keyup = has('keyup', (item) => item.key === name);
  const clicks = list.filter((item) => Boolean(item) && item.type === 'click').length;
  // The element the page gave the key to: "delivered" says the page saw the key, the target says whom it went to (the button, or the page body).
  const down = list.find((item) => Boolean(item) && item.type === 'keydown' && item.key === name);
  return { key, keydown, keypress, keyup, clicks, delivered: key === 'Enter' ? keydown && keypress : keydown && keyup, keydown_target: down ? down.target : null };
}
const KEY_RECORDER_SOURCE = `(() => { if (window.__b2KeyRecords) return true; const list = window.__b2KeyRecords = [];
  for (const type of ['keydown', 'keypress', 'keyup', 'click']) {
    window.addEventListener(type, (event) => { if (list.length < 400) list.push({ type, key: event.key === undefined ? null : event.key,
      charCode: event.charCode === undefined ? null : event.charCode, target: event.target && event.target.tagName ? event.target.tagName : null, trusted: event.isTrusted === true }); }, true);
  }
  return true; })()`;

// B2-SAFE-02 (rehearsal 7): the contract says a required audit failure stops the Turn and an unknown side effect is never recorded as zero.
// The product reports the failure in the IPC answer of a9.turn.submit (error code A9_AUDIT_PERSISTENCE_FAILED), keeps the dispatch stopped and does
// not write the Turn row, so the verdict reads the IPC answer; page text and Turn row are evidence only.
const AUDIT_FAILURE_CODE = 'A9_AUDIT_PERSISTENCE_FAILED';
// The scenario b2:audit-write asks the Provider for one write. A request that carries the tool result (a message with role "tool") is the dispatch
// after the failed tool_end that the hard stop must prevent. The number of requests is not fixed: the Gateway retries a lost response up to five times
// and a retry carries no tool result (codex round 5, R4). The Provider log must agree with the counters, or the window was not fully observed.
function evaluateAuditHardStop(f) {
  const facts = f || {};
  const calls = Array.isArray(facts.submit_calls) ? facts.submit_calls : [];
  const first = calls[0] || null;
  const second = calls[1] || null;
  const requests = facts.requests || {};
  const providerWindow = facts.provider_window || {};
  const countersObserved = isCount(requests.before) && isCount(requests.after_turn) && isCount(requests.after_next_submit);
  const logAgrees = countersObserved && isCount(providerWindow.requests) && isCount(providerWindow.tool_result_requests)
    && providerWindow.requests === requests.after_next_submit - requests.before;
  const observed = Boolean(first) && typeof facts.file_written === 'boolean' && Number.isSafeInteger(facts.tool_ends) && countersObserved && logAgrees;
  const detail = `file_written=${facts.file_written}; tool_end_persisted=${facts.tool_ends}; submit_ok=${first ? first.ok : null}; submit_error_code=${first ? first.error : null}; `
    + `next_submit_error_code=${second ? second.error : 'not observed'}; turn_status=${facts.turn_status}; requests=${requests.before}->${requests.after_turn}->${requests.after_next_submit}; `
    + `provider_log_requests=${providerWindow.requests}; requests_with_tool_result=${providerWindow.tool_result_requests}; `
    + `page_shows_code=${facts.page_shows_code} (observation); outcome_json_has_code=${facts.outcome_json_has_code} (observation)`;
  if (!observed) return { status: 'UNKNOWN', detail: `a9.turn.submit answer, counters or Provider log not observed (the log must hold one line per counted request); ${detail}` };
  const codeReturned = first.ok === false && first.error === AUDIT_FAILURE_CODE;
  const firstTurnDispatched = requests.after_turn - requests.before >= 1;
  const noToolResultDispatch = providerWindow.tool_result_requests === 0;
  const dispatchStopped = requests.after_next_submit === requests.after_turn;
  const ok = facts.file_written === true && facts.tool_ends === 0 && codeReturned && facts.turn_status !== 'completed' && firstTurnDispatched && noToolResultDispatch && dispatchStopped;
  if (!ok) return { status: 'FAIL', detail };
  // "No new request after the next submit" proves nothing when that submit never reached the product.
  if (!second) return { status: 'UNKNOWN', detail: `the second a9.turn.submit was not observed; ${detail}` };
  return { status: 'PASS', detail };
}

// B2-S03T (codex round 5, R1): the Turn ends as stuck after three reads and the terminal audit write fails. The follow-up submit is the challenge; "no new
// request" proves nothing unless the counters were read and the follow-up reached the product through a9.turn.submit. The request total is not fixed.
function evaluateTerminalAudit(f) {
  const facts = f || {};
  const calls = Array.isArray(facts.submit_calls) ? facts.submit_calls : [];
  const requests = facts.requests || {};
  const observed = isCount(requests.before) && isCount(requests.after_turn) && isCount(requests.after_next_submit)
    && isCount(facts.tool_starts) && isCount(facts.later_shell_dispatches) && typeof facts.turn_completed === 'boolean';
  const detail = `tool_starts=${facts.tool_starts}; turn_completed_persisted=${facts.turn_completed}; requests=${requests.before}->${requests.after_turn}->${requests.after_next_submit}; `
    + `later_shell_dispatches=${facts.later_shell_dispatches}; submit_calls=${calls.length}`;
  if (!observed) return { status: 'UNKNOWN', detail: `counters or events not observed; ${detail}` };
  const ok = facts.tool_starts === 3 && !facts.turn_completed && requests.after_next_submit === requests.after_turn && facts.later_shell_dispatches === 0;
  if (!ok) return { status: 'FAIL', detail };
  if (calls.length < 2) return { status: 'UNKNOWN', detail: `the second a9.turn.submit was not observed; ${detail}` };
  return { status: 'PASS', detail };
}

// Restart checks (codex round 5, R2): a counter or a Turn status that was not read is UNKNOWN. `undefined === undefined` and `null === null` are not "unchanged".
const isStatusText = (value) => typeof value === 'string' && value.length > 0;
function evaluateRestartCounts(pre, facts) {
  const at = (object, key) => (object ? object[key] : undefined);
  const kill = at(at(pre, 'counters'), 'requests');
  const boot = at(at(facts, 'afterBoot'), 'requests');
  const refresh = at(at(facts, 'afterRefresh'), 'requests');
  const toolsKill = at(pre, 'toolEvents');
  const toolsBoot = at(at(facts, 'state1'), 'tools');
  const toolsRefresh = at(at(facts, 'state2'), 'tools');
  if (![kill, boot, refresh, toolsKill, toolsBoot, toolsRefresh].every(isCount)) return null;
  return boot === kill && refresh === kill && toolsBoot === toolsKill && toolsRefresh === toolsKill;
}
function evaluateOldTurnUnchanged(before, after) {
  if (!isStatusText(before) || !isStatusText(after)) return null;
  return before === after;
}
// The two B2-CH-04 answers of the restart phase: [interrupted state is stable, no request or tool event was added].
function evaluateInterruptRecords(pre, facts) {
  const at = (object, key) => (object ? object[key] : undefined);
  const turnRestart = at(at(facts, 'state1'), 'turn');
  const turnRefresh = at(at(facts, 'state2'), 'turn');
  const stable = isStatusText(turnRestart) && isStatusText(turnRefresh) ? turnRestart === turnRefresh && turnRefresh !== 'completed' : null;
  const rest = Boolean(at(facts, 'recovery')) && facts.recovery.canContinue === true && Boolean(at(facts, 'card')) && facts.card.button === '继续' && at(facts, 'pending') === null;
  const zero = evaluateRestartCounts(pre, facts);
  return [
    { status: statusOf(withGuard(rest, stable)),
      detail: `can_continue=${at(at(facts, 'recovery'), 'canContinue')}; card_button=${at(at(facts, 'card'), 'button')}; turn_status_restart=${turnRestart}; turn_status_refresh=${turnRefresh}; pending_approval=${at(facts, 'pending') ? 'present' : 'none'}` },
    { status: statusOf(zero),
      detail: `provider_requests_kill=${at(at(pre, 'counters'), 'requests')}; after_bootstrap=${at(at(facts, 'afterBoot'), 'requests')}; after_refresh=${at(at(facts, 'afterRefresh'), 'requests')}; `
        + `tool_events=${at(pre, 'toolEvents')}->${at(at(facts, 'state1'), 'tools')}->${at(at(facts, 'state2'), 'tools')}${zero === null ? ' (not observed)' : ''}` },
  ];
}

// B2-S04 (rehearsal 7, KL-5): under Windows PowerShell the product decodes Shell output as strict UTF-8, so only UTF-8 and CRLF decide the
// verdict. CP936 and UTF-16LE still run; their outcome is evidence labelled INFORMATIONAL and never changes PASS or FAIL.
const ENCODING_GATING = ['utf8', 'crlf'];
function evaluateEncodingOutcomes(outcomes) {
  const list = Array.isArray(outcomes) ? outcomes.filter(Boolean) : [];
  const gating = ENCODING_GATING.map((label) => list.find((item) => item.label === label) || null);
  const missing = ENCODING_GATING.filter((_label, index) => !gating[index]);
  const text = list.map((item) => `${item.label}=${item.ok}${ENCODING_GATING.includes(item.label) ? '' : ' (INFORMATIONAL, KL-5)'}`).join('; ');
  if (missing.length > 0) return { status: 'UNKNOWN', text: `${text}; not_observed=${missing.join(',')}` };
  return { status: gating.every((item) => item.ok === true) ? 'PASS' : 'FAIL', text };
}

// Streamed rows are counted where the product renders them: the live-output block of the tool call (pre.shell-live-output, one per call).
// The same text also appears in the tool result detail and the raw output panel; those places are not duplicates of the rows (rehearsal 4: whole-page count was 2).
// Missing counts are not observed (null); a block count other than one, or a text not exactly once in the blocks, is a violated expectation (false).
function evaluateStreamedOnce(counts, expectedTexts) {
  const texts = Array.isArray(expectedTexts) ? expectedTexts : [];
  if (!counts || !Array.isArray(counts.per_text) || counts.per_text.length !== texts.length || !Number.isSafeInteger(counts.live_blocks) || texts.length === 0) return null;
  return counts.live_blocks === 1 && counts.per_text.every((item) => item && item.live === 1);
}

// Managed process facts that still count as live work or unconfirmed cleanup (the same states the product uses to block a conversation switch).
const ACTIVE_MANAGED_STATES = Object.freeze(['running', 'starting', 'running_unknown', 'identity_mismatch']);
function managedResidueItems(managedProcesses) {
  return (Array.isArray(managedProcesses) ? managedProcesses : []).filter((item) => item && (ACTIVE_MANAGED_STATES.includes(item.lastProbeStatus) || item.cleanupRequired === true));
}
// One record per fact, enough to tell a lagging status from a real leftover without reading the database.
const managedFactSummary = (item) => ({ handleId: item.handleId, status: item.lastProbeStatus, cleanup_required: item.cleanupRequired === true, ownership: item.ownershipState || null,
  recovery: item.recoveryStatus || null, pid_reuse_possible: item.pidReusePossible === true });

// B2-BG-03 A01 (WIN7-45). Three finished facts, each leaving no process: a second Stop, a command that exits at once, a start that fails.
// A command that exits at once is a successful start followed by a natural exit; it is not a readiness failure (WIN7-43 formal review, P1).
// The readiness failure of the helper (D-013) cannot be induced from outside the product (KL-12). The start with an unusable working directory
// is the closest failed start the suite can cause: the path it takes is recorded, and the verdict judges the facts it leaves, not the path.
const BAD_CWD_PATHS = Object.freeze(['refused', 'helper_start_failed', 'started']);
const HELPER_START_FAILED = 'A9_BACKGROUND_HELPER_START_FAILED';
function classifyFailedStart(ends) {
  if (!Array.isArray(ends) || ends.length !== 1) return null;
  const summary = summarizeToolEnd(ends[0]);
  if (!summary.failed) return 'started';
  return summary.error === HELPER_START_FAILED || String(summary.result_head).includes(HELPER_START_FAILED) ? 'helper_start_failed' : 'refused';
}
const isActiveManagedStatus = (status) => ['running', 'starting', 'running_unknown', 'identity_mismatch'].includes(status);
// Handle states the product reports once a command is over. A fact outside this list that is not live either is not a clean end: it is not
// observed (UNKNOWN), never a finished handle (codex round 16, P2: "not_observed" was read as terminal).
const TERMINAL_MANAGED_STATES = Object.freeze(['exited', 'stopped', 'failed', 'released']);
const allOf = (...values) => (values.includes(false) ? false : values.includes(null) ? null : true);
// true: every fact is a finished one with nothing to clean; false: one is live or needs cleanup; null: the list or a fact was not observed.
function factsFinished(facts) {
  if (!Array.isArray(facts)) return null;
  let unknown = false;
  for (const item of facts) {
    if (!item || typeof item !== 'object') { unknown = true; continue; }
    if (isActiveManagedStatus(item.lastProbeStatus) || item.lastProbeStatus === 'cleanup_required' || item.cleanupRequired === true) return false;
    if (!TERMINAL_MANAGED_STATES.includes(item.lastProbeStatus)) unknown = true;
  }
  return unknown ? null : true;
}
// The one start of a command that must have succeeded: the tool answered, did not fail, and said the process started. A tool end that could not be read is not a start.
function startedOk(ends) {
  if (!Array.isArray(ends) || ends.length !== 1) return false;
  const summary = summarizeToolEnd(ends[0]);
  if (summary.failed) return false;
  return summary.result_status === 'background_started' ? true : summary.result_status === null ? null : false;
}
function evaluateBg03Facts(input) {
  const given = input && typeof input === 'object' ? input : {};
  const stopsObserved = Array.isArray(given.stops) && Array.isArray(given.afterStopFacts);
  const stops = stopsObserved ? given.stops : [];
  const afterStop = stopsObserved ? given.afterStopFacts : [];
  const crash = stops[1] ? /crash|exception|TypeError/i.test(JSON.stringify(eventData(stops[1]))) : false;
  const cleanAfterStop = afterStop.every((item) => !isActiveManagedStatus(item.lastProbeStatus));
  const doubleStop = !stopsObserved ? null : stops.length === 2 && !toolEndFailed(stops[0]) && !crash && cleanAfterStop;
  // A list that was not given is not observed (UNKNOWN); a list that was given and is empty is an observed zero (codex round 16, P2).
  const fast = given.fast || {};
  const fastObserved = Array.isArray(fast.ends) && Array.isArray(fast.newFacts) && Array.isArray(fast.residue);
  const fastEnds = fastObserved ? fast.ends : [];
  const fastFacts = fastObserved ? fast.newFacts : [];
  const fastResidue = fastObserved ? fast.residue : [];
  const fastFact = fastFacts.length === 1 ? fastFacts[0] : null;
  const fastFactOk = !fastFact || typeof fastFact !== 'object' ? false : fastFact.cleanupRequired === true ? false
    : fastFact.lastProbeStatus === 'exited' ? true : isActiveManagedStatus(fastFact.lastProbeStatus) || TERMINAL_MANAGED_STATES.includes(fastFact.lastProbeStatus) || fastFact.lastProbeStatus === 'cleanup_required' ? false : null;
  const fastExit = !fastObserved ? null : allOf(startedOk(fastEnds), fastFactOk, fastResidue.length === 0);
  const bad = given.bad || {};
  const badObserved = Array.isArray(bad.ends) && Array.isArray(bad.newFacts) && Array.isArray(bad.residue);
  const badEnds = badObserved ? bad.ends : [];
  const badFacts = badObserved ? bad.newFacts : [];
  const badResidue = badObserved ? bad.residue : [];
  const badPath = badObserved ? classifyFailedStart(badEnds) : null;
  // A start that did not fail did not exercise the claim: its facts are still judged, but the answer cannot be PASS (UNKNOWN).
  const badClean = badObserved ? allOf(badPath !== null, badResidue.length === 0, factsFinished(badFacts)) : null;
  const badOk = badClean !== true ? badClean : badPath === 'started' ? null : true;
  const subs = [
    subResult('double_stop', doubleStop, `stop_calls=${stops.length}; second_stop_error=${stops[1] ? toolEndFailed(stops[1]) : 'n/a'}; crash_text=${crash}; clean_after_stop=${cleanAfterStop}; observed=${stopsObserved}`),
    subResult('fast_exit', fastExit, `start_ends=${fastEnds.length}; start_failed=${fastEnds[0] ? toolEndFailed(fastEnds[0]) : 'n/a'}; new_facts=${fastFacts.length}; fact_status=${fastFacts[0] ? fastFacts[0].lastProbeStatus : 'n/a'}; residue=${fastResidue.length}; observed=${fastObserved}`),
    subResult('failed_start', badOk, `path=${badPath}; start_ends=${badEnds.length}; new_facts=${badFacts.length}; fact_status=${badFacts[0] ? badFacts[0].lastProbeStatus : 'n/a'}; residue=${badResidue.length}; observed=${badObserved}${badPath === 'started' ? '; the start did not fail, so the failed-start claim was not exercised' : ''}`),
  ];
  // The observed text keeps each detail: the phase result is what the owner reads, and a bare "failed_start=UNKNOWN" would not say why.
  return { path: badPath, subs, status: summarizeSubs(subs).status, text: subs.map((item) => `${item.name}=${item.status} [${item.detail}]`).join('; ') };
}

// The exit dialog as the driver saw it: the three button names in order and the index the click returned. The smoke judges both after the exit.
function exitDialogFacts(entry, activeBefore) {
  const labels = entry && Array.isArray(entry.buttons) ? entry.buttons : [];
  return { dialog: entry, expected_buttons: EXIT_BUTTONS, buttons_ok: JSON.stringify(labels) === JSON.stringify(EXIT_BUTTONS), active_managed_before_quit: activeBefore,
    returned_index: entry ? entry.response : null, timed_out: false };
}

// B2-BG-03 A02 evidence, product side: the ownership events of one handle must run owned, release_intent, released with one release id.
// Rows are the a9_events rows of type managed_process_ownership (payload_json text). Rows that could not be read are not observed (null).
const RELEASE_SEQUENCE = Object.freeze(['owned', 'release_intent', 'released']);
function evaluateReleaseSequence(rows, handleId) {
  if (!Array.isArray(rows) || typeof handleId !== 'string' || handleId === '') return { ok: null, sequence: [], release_ids: [], same_release_id: null, events: 0 };
  const events = [];
  for (const row of rows) {
    let payload = null;
    try { payload = JSON.parse(row.payload_json); } catch (_error) { payload = null; }
    if (payload && payload.handleId === handleId) events.push({ id: row.id, created_at: row.created_at, ownershipState: payload.ownershipState, releaseId: payload.releaseId || null });
  }
  const sequence = events.map((item) => item.ownershipState);
  const releaseIds = events.filter((item) => item.releaseId).map((item) => item.releaseId);
  const same = releaseIds.length === 2 && releaseIds[0] === releaseIds[1];
  return { ok: JSON.stringify(sequence) === JSON.stringify(RELEASE_SEQUENCE) && same && events[1].releaseId !== null && events[2].releaseId !== null, sequence, release_ids: releaseIds, same_release_id: same, events: events.length, rows: events };
}

// Pages through events with beforeEventId; the union must equal the full list in order.
function evaluatePaging(full, pages) {
  const merged = [];
  for (const page of pages) merged.unshift(...page);
  const fullIds = full.map((event) => event.eventId);
  const mergedIds = merged.map((event) => event.eventId);
  return { ok: fullIds.length > 0 && JSON.stringify(fullIds) === JSON.stringify(mergedIds), full: fullIds.length, merged: mergedIds.length, pages: pages.length };
}

// ---- A9-36 supplement evaluators (pure; unit-tested without Electron) ------------------------------------------
// ---- A9-36 supplement evaluators (pure; exported for the contract tests) ---------------------------------------------------------------------------------
// Every verdict is a closed list of named checks; an unobserved fact is `undefined`, never equal to another unobserved fact, and fails its check.
const SUP_SHA40 = /^[0-9a-f]{40}$/;
const SUP_SHA64 = /^[a-f0-9]{64}$/;
const supVerdict = (checks) => ({ ok: Object.values(checks).every((v) => v === true), checks });
const supText = (value) => (typeof value === 'string' ? value : '');
// An identity or expected value must be observed: two missing values are not "equal".
const supNonEmpty = (value) => typeof value === 'string' && value.length > 0;
// An entry of an undo outcome's `restored` list is the path itself or the path followed by one of the notes the checkpoint manager writes (src/workspace/src/checkpoint-manager.ts);
// matching is by equality, so another file whose name merely begins with the path, or a note of another shape, is not this file.
const SUP_RESTORED_NOTES = Object.freeze(['此前已撤销，未重复执行', '已移除新建文件', '检测到此前已完成恢复', '已恢复原始目录', '已恢复原始版本']);
const supRestoredFor = (list, file) => Array.isArray(list) && supNonEmpty(file) && list.some((e) => typeof e === 'string' && (e === file || SUP_RESTORED_NOTES.some((note) => e === `${file} (${note})`)));
// M1-02: the local bare origin still holds exactly refs/heads/main at the commit it had before the 19 push forms.
// The product opens the native open dialog for two purposes: the workspace folder (openDirectory) and an explicit Shell executable (openFile, the title names the kind).
// Each purpose gets its own answer; any other use is refused, so an answer meant for one purpose cannot reach the other.
function openDialogAnswer(args, workspaceRoot, cmdExecutable) {
  const options = (Array.isArray(args) ? args : []).find((item) => item && typeof item === 'object' && Array.isArray(item.properties)) || {};
  const properties = Array.isArray(options.properties) ? options.properties : [];
  if (properties.includes('openDirectory')) return { canceled: false, filePaths: [workspaceRoot] };
  if (properties.includes('openFile') && options.title === '选择 cmd Shell 可执行文件') return { canceled: false, filePaths: [cmdExecutable] };
  throw new Error('A9_36_UNEXPECTED_OPEN_DIALOG');
}
// M1-02: nineteen denied push forms. Each card is bound to the command and shows it; the Git binding names origin/main (the 17th form, cat11-bulk-cmd, is bound by the digest of the whole command);
// nothing ran; origin still holds the one ref it held at setup, and the local main, which is one commit ahead of origin/main, did not move.
const WHOLE_COMMAND_FORM_INDEX = 16;
function evaluateGitDenials(f) {
  const facts = f || {}; const forms = Array.isArray(facts.forms) ? facts.forms : [];
  const all = (test) => forms.length === 19 && forms.every((x, i) => Boolean(x) && test(x, i));
  return supVerdict({
    nineteen_forms: forms.length === 19,
    each_card_bound: all((x) => x.bound === true && x.visible_bound_card === true && x.row_bound === true),
    each_denied_without_execution: all((x) => x.no_execution === true && x.approval_decision === 'denied'),
    origin_main_binding: all((x, i) => (i === WHOLE_COMMAND_FORM_INDEX ? x.remote === null && x.branch === null : x.remote === 'origin' && x.branch === 'main')),
    origin_refs_unchanged: evaluateOriginRefs(facts.origin_main, facts.refs_before) && facts.refs_before === facts.refs_after && evaluateOriginRefs(facts.origin_main, facts.refs_after),
    local_main_ahead_unchanged: SUP_SHA40.test(facts.local_main_before || '') && facts.local_main_before !== facts.origin_main && facts.local_main_before === facts.local_main_after
      && facts.unpushed_before === '1' && facts.unpushed_after === '1',
  });
}
function evaluateOriginRefs(initialMain, refsText) {
  return SUP_SHA40.test(initialMain || '') && typeof refsText === 'string' && refsText.trim() === `refs/heads/main ${initialMain}`;
}
// M1-04: local branch listing, local branch switch, add and an approved local commit; files, index, refs and processes before and after.
function evaluateLocalBranch(f) {
  const facts = f || {};
  const ends = Array.isArray(facts.shell_ends) ? facts.shell_ends : [];
  return supVerdict({
    four_shell_calls: ends.length === 4 && ends.every((e) => e && e.exit_code === 0),
    listed_main: Boolean(ends[0]) && supText(ends[0].stdout).trim() === 'main',
    branch_before_main: facts.branch_before === 'main',
    branch_after_topic: facts.branch_after === 'a2-topic',
    commit_subject: facts.head_subject === 'A2-topic',
    main_ref_unchanged: SUP_SHA40.test(facts.main_before || '') && facts.main_before === facts.main_after,
    origin_unchanged: evaluateOriginRefs(facts.origin_main, facts.origin_refs_after),
    worktree_dirty_before: /^ M probe\.txt$/m.test(supText(facts.status_before)),
    probe_committed: !/probe\.txt/.test(supText(facts.status_after)) && Array.isArray(facts.head_files) && facts.head_files.includes('probe.txt'),
    index_changed: typeof facts.index_before === 'string' && typeof facts.index_after === 'string' && facts.index_before !== facts.index_after,
    blob_matches_file: SUP_SHA40.test(facts.head_blob || '') && facts.head_blob === facts.worktree_blob,
    approval_accepted: Boolean(facts.approval) && facts.approval.accepted === true,
    no_new_processes: Array.isArray(facts.new_processes) && facts.new_processes.length === 0,
  });
}
// M1-05, test-class command: a command that ends, with its v3 stream frames persisted in order and the exit code.
function evaluateTestStream(f) {
  const facts = f || {};
  const frames = Array.isArray(facts.frames) ? facts.frames : [];
  const ends = Array.isArray(facts.ends) ? facts.ends : [];
  return supVerdict({
    order_ok: Boolean(facts.order) && facts.order.ok === true,
    frames_present: frames.length >= 1,
    frames_in_turn: supNonEmpty(facts.turn_id) && frames.length >= 1 && frames.every((fr) => fr && fr.turnId === facts.turn_id),
    marker_streamed: frames.some((fr) => supText(fr.text).includes('A2-CHECK')),
    one_shell_end: ends.length === 1,
    exit_zero: ends.length === 1 && ends[0].exit_code === 0,
    stdout_marker: ends.length === 1 && supText(ends[0].stdout).includes('A2-CHECK'),
    explicit_cmd: facts.shell_kind === 'cmd',
    completed: ['completed', 'completed_with_warnings'].includes(facts.outcome),
  });
}
// M1-05, build-class command cancelled while it streams: output reached the page store first, the Turn ends cancelled, nothing keeps running or printing.
function evaluateBuildCancel(f) {
  const facts = f || {};
  return supVerdict({
    start_streamed: facts.start_seen === true,
    ticks_before_cancel: Number.isSafeInteger(facts.ticks_before_cancel) && facts.ticks_before_cancel >= 2,
    order_ok: Boolean(facts.order) && facts.order.ok === true,
    cancelled: facts.terminal_outcome === 'cancelled',
    output_stopped: Number.isSafeInteger(facts.frames_after_settle) && facts.frames_after_settle === facts.frames_after_wait,
    no_new_processes: Array.isArray(facts.new_processes) && facts.new_processes.length === 0,
    process_probe_complete: facts.process_probe_failures === 0,
  });
}
// M1-06: the approval card of a command far above 200 characters, at 1366x768: full command and cwd in the text, nothing clipped, inside the window, controls reachable.
function evaluateLongCard(f) {
  const facts = f || {}; const rect = facts.card_rect || {}; const view = facts.viewport || {}; const buttons = Array.isArray(facts.buttons) ? facts.buttons : [];
  const inside = (r) => Boolean(r) && r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= view.width && r.bottom <= view.height;
  const command = supText(facts.command); const summary = supText(facts.summary);
  return supVerdict({
    command_above_200: command.length > 200,
    summary_has_command: command.length > 0 && summary.includes(command),
    summary_has_cwd: summary.includes('cwd=') && facts.cwd_shown_resolves === true,
    page_text_equals_summary: facts.dom_summary === summary,
    viewport_1366x768: view.width === 1366 && view.height === 768,
    card_inside_window: inside(rect),
    controls_inside_window: buttons.length >= 2 && buttons.every(inside),
    summary_not_clipped: facts.clipped === false,
    readable_font: Number.isFinite(facts.font_px) && facts.font_px >= 12,
    bound_to_command: facts.bound === true,
    denied_without_execution: facts.denied_ok === true && facts.tool_starts_after === 0,
  });
}
// M1-07 [C]: the package Policy engine alone, Full Access. Wrapped launcher forms and pure data forms are all `allow` under POLICY_FULL_ACCESS_ALLOWED (ADR-0239); controls still ask.
function evaluateF01(rows, expected) {
  const list = Array.isArray(rows) ? rows : []; const want = expected || {};
  const group = (name) => list.filter((r) => r && r.group === name);
  const allowed = (r) => r.verdict === 'allow' && r.rule_id === 'POLICY_FULL_ACCESS_ALLOWED';
  const sameSet = (name, commands) => Array.isArray(commands) && group(name).length === commands.length && commands.every((c) => group(name).some((r) => r.command === c));
  return supVerdict({
    wrapped_listed: sameSet('wrapped', want.wrapped) && group('wrapped').length === 13,
    data_listed: sameSet('data', want.data) && group('data').length === 4,
    controls_listed: sameSet('control', want.controls) && group('control').length === 2,
    wrapped_allowed: group('wrapped').length === 13 && group('wrapped').every(allowed),
    data_allowed: group('data').length === 4 && group('data').every(allowed),
    controls_not_allowed: group('control').length === 2 && group('control').every((r) => r.verdict !== 'allow'),
    no_execution: want.tool_starts_before !== undefined && want.tool_starts_before === want.tool_starts_after,
  });
}
// M2-04 input binding: the request carries the AGENTS.md that was on disk and one system prompt body, hashed.
function evaluateInputShas(f) {
  const facts = f || {}; const requests = Array.isArray(facts.requests) ? facts.requests : [];
  return supVerdict({
    two_requests: requests.length === 2,
    agents_bound: SUP_SHA64.test(facts.agents_sha256 || '') && requests.length > 0 && requests.every((r) => r.agents_sha256 === facts.agents_sha256 && r.agents_in_request === true),
    system_hashed: requests.length > 0 && requests.every((r) => SUP_SHA64.test(r.system_sha256 || '')),
    system_stable: requests.length > 0 && new Set(requests.map((r) => r.system_sha256)).size === 1,
    one_rule_one_environment: requests.length > 0 && requests.every((r) => r.rules === 1 && r.environment === 1),
  });
}
// M2-03 and M2-06 (audit): a required audit write fails; the Turn stops, the next submit is refused with the audit code, nothing is dispatched afterwards.
function evaluateAuditStage(f) {
  const facts = f || {}; const counts = facts.requests || {}; const cont = facts.continue_attempts;
  const checks = {
    trigger_installed: facts.trigger_installed === true,
    failing_event_absent: facts.failing_event_rows === 0,
    turn_not_completed: facts.turn_completed === false,
    second_tool_never_ran: facts.never_exists === false,
    no_tool_result_dispatch: Number.isSafeInteger(facts.tool_result_requests) && facts.tool_result_requests <= (facts.max_tool_result_requests || 0),
    submit_refused: facts.second_submit_ok === false && facts.second_submit_code === 'A9_AUDIT_PERSISTENCE_FAILED',
    no_request_after_submit: Number.isSafeInteger(counts.after_turn) && counts.after_turn === counts.after_submit,
    first_request_sent: Number.isSafeInteger(counts.before) && counts.after_turn - counts.before >= 1,
  };
  if (facts.require_continue === true) {
    const counted = (c, a, b) => Number.isSafeInteger(c[a]) && Number.isSafeInteger(c[b]) && c[a] === c[b];
    checks.continue_blocked = Array.isArray(cont) && cont.length === 2 && cont.every((c) => c && c.code === 'A9_AUDIT_PERSISTENCE_FAILED' && c.ok === false
      && counted(c, 'requests_before', 'requests_after') && counted(c, 'continue_events_before', 'continue_events_after') && counted(c, 'turns_before', 'turns_after') && counted(c, 'tool_starts_before', 'tool_starts_after'));
    checks.continue_revisions_differ = Array.isArray(cont) && cont.length === 2 && supNonEmpty(cont[0].revision) && supNonEmpty(cont[1].revision) && cont[0].revision !== cont[1].revision;
  }
  return supVerdict(checks);
}
// M2-04 (continuation): the new loop reads the AGENTS.md of the moment, the environment facts and the same system prompt; the original goal is carried.
function evaluateContinueReload(f) {
  const facts = f || {}; const base = facts.baseline || {}; const lines = Array.isArray(facts.continuation_lines) ? facts.continuation_lines : [];
  return supVerdict({
    baseline_bound: SUP_SHA64.test(facts.agents_old_sha256 || '') && base.agents_sha256 === facts.agents_old_sha256 && SUP_SHA64.test(base.system_sha256 || ''),
    continuation_requests: lines.length >= 1 && lines.every((r) => r.continuation === true),
    agents_changed: SUP_SHA64.test(facts.agents_new_sha256 || '') && facts.agents_new_sha256 !== facts.agents_old_sha256,
    agents_reloaded: lines.length >= 1 && lines.every((r) => r.agents_sha256 === facts.agents_new_sha256 && r.agents_in_request === true),
    only_new_rule_marker: lines.length >= 1 && lines.every((r) => JSON.stringify(r.rule_markers) === JSON.stringify([facts.new_marker]) && r.rules === 1),
    environment_once: lines.length >= 1 && lines.every((r) => r.environment === 1),
    system_prompt_same: lines.length >= 1 && lines.every((r) => r.system_sha256 === base.system_sha256),
    goal_carried: lines.length >= 1 && lines.every((r) => r.prompt === facts.goal),
  });
}
// M2-06 Provider failure: zero automatic dispatch after the failure, one explicit click dispatches, the chain names the failed Turn, a repeated old key returns the original identity.
function evaluateProviderFailureContinue(f) {
  const facts = f || {}; const first = facts.first || {}; const second = facts.second || {}; const dup = facts.duplicate || {};
  return supVerdict({
    failed_dispatch: Number.isSafeInteger(first.requests_delta) && first.requests_delta >= 1 && first.continue_events === 1,
    no_automatic_dispatch: Number.isSafeInteger(facts.requests_after_failure) && facts.requests_after_failure === facts.requests_after_wait,
    actionable_again: stopLeavesActionableCard(facts.recovery_before, facts.recovery_after_failure) === true,
    click_dispatches: Number.isSafeInteger(second.requests_before) && second.requests_after > second.requests_before && second.requests_before === facts.requests_after_wait,
    two_continue_events: second.continue_events === 2,
    chain_names_failed_turn: Boolean(first.turn_id) && second.interrupted_turn_id === first.turn_id
      && Boolean(facts.recovery_after_failure) && facts.recovery_after_failure.interruptedTurnId === first.turn_id,
    second_turn_completed: ['completed', 'completed_with_warnings'].includes(second.turn_status),
    duplicate_identity: dup.ok === true && dup.duplicate === true && Boolean(first.turn_id) && dup.turn_id === first.turn_id,
    duplicate_no_dispatch: Number.isSafeInteger(dup.requests_before) && dup.requests_before === dup.requests_after && dup.continue_events_before === dup.continue_events_after,
  });
}
// M2-06 budget: a continuation whose non-compressible input is above the saved budget sends nothing, keeps its Turn fact and shows the budget diagnostic.
function evaluateBudgetClick(f) {
  const facts = f || {}; const before = facts.before || {}; const after = facts.after || {}; const diag = facts.diagnostic || {};
  return supVerdict({
    requests_unchanged: Number.isSafeInteger(before.requests) && before.requests === after.requests,
    tools_unchanged: Number.isSafeInteger(before.tool_starts) && before.tool_starts === after.tool_starts,
    turn_fact_kept: Number.isSafeInteger(before.turns) && after.turns === before.turns + 1,
    continue_event_added: Number.isSafeInteger(before.continue_events) && after.continue_events === before.continue_events + 1,
    budget_code: diag.code === 'A9_CONTEXT_BUDGET_EXCEEDED',
    budget_is_saved_value: diag.budgetChars === facts.configured_budget,
    estimate_above_budget: Number.isFinite(diag.estimatedChars) && diag.estimatedChars > facts.configured_budget,
    actionable_again: stopLeavesActionableCard(facts.recovery_before, facts.recovery_after) === true,
  });
}
// M2-06 budget, changed condition: only after the input fits is a new request sent.
function evaluateBudgetChanged(f) {
  const facts = f || {}; const before = facts.before || {}; const after = facts.after || {};
  return supVerdict({
    request_sent: Number.isSafeInteger(before.requests) && after.requests > before.requests,
    continue_event_added: Number.isSafeInteger(before.continue_events) && after.continue_events === before.continue_events + 1,
    input_fits: Number.isFinite(facts.chars) && facts.chars > 0 && facts.chars <= facts.configured_budget,
    turn_completed: ['completed', 'completed_with_warnings'].includes(facts.turn_status),
  });
}
// M3-01 and M3-03: B0 before the Turn, B1 after an external modification of an EXISTING file, B2 after undo. B1 differs from B0 and B2 equals B0, byte for byte.
function evaluatePerFileStep(step, files) {
  const pf = step || {}; const target = files.find((x) => x && x.path === pf.path); const outcome = pf.result && pf.result.outcome;
  return Boolean(target) && pf.result.ok === true && Boolean(outcome) && Array.isArray(outcome.errors) && outcome.errors.length === 0
    && Array.isArray(outcome.restored) && supRestoredFor(outcome.restored, pf.path) && Boolean(pf.after)
    && pf.after[pf.path] === target.b0 && files.filter((x) => x.path !== pf.path).every((x) => pf.after[x.path] === x.b1);
}
function evaluateExternalBytes(f) {
  const facts = f || {}; const files = Array.isArray(facts.files) ? facts.files : [];
  return supVerdict({
    files_listed: files.length >= 1 && files.every((x) => x && typeof x.path === 'string'),
    modified: files.length >= 1 && files.every((x) => SUP_SHA64.test(x.b0 || '') && SUP_SHA64.test(x.b1 || '') && x.b1 !== x.b0),
    expected_content: files.length >= 1 && files.every((x) => supNonEmpty(x.expected_b1_text) && x.b1_text === x.expected_b1_text),
    in_diff: files.length >= 1 && files.every((x) => Array.isArray(facts.review_paths) && facts.review_paths.includes(x.path)),
    restored_bytes: files.length >= 1 && files.every((x) => x.b2 === x.b0),
    undo_ok: Array.isArray(facts.undo_results) && facts.undo_results.length >= 1 && facts.undo_results.every((r) => r && r.ok === true),
    // `ok` alone does not say that a file was restored: every undo reports its errors, and every file must be listed as restored by some undo.
    no_undo_errors: Array.isArray(facts.undo_results) && facts.undo_results.length >= 1 && facts.undo_results.every((r) => r && r.outcome && Array.isArray(r.outcome.errors) && r.outcome.errors.length === 0),
    restored_listed: files.length >= 1 && Array.isArray(facts.undo_results) && files.every((x) => facts.undo_results.some((r) => r && r.outcome && Array.isArray(r.outcome.restored) && supRestoredFor(r.outcome.restored, x.path))),
    // With a per-file undo before the whole-Turn undo, the bytes right after the per-file undo are the proof that this step worked on its own.
    per_file_undo: facts.require_per_file !== true || evaluatePerFileStep(facts.per_file, files),
    // A whole-Turn undo that follows a per-file undo may list the already restored path, so the caller names the results that must be free of drift.
    no_drift: Array.isArray(facts.drift_results || facts.undo_results) && (facts.drift_results || facts.undo_results).length >= 1
      && (facts.drift_results || facts.undo_results).every((r) => r && Array.isArray(r.driftReasons) && r.driftReasons.length === 0 && r.outcome && Array.isArray(r.outcome.drifted) && r.outcome.drifted.length === 0),
  });
}
// M3-02: the checkpoint of a continuation Turn belongs to that Turn and conversation, and undo restores the file edited in it.
function evaluateContinuationCheckpoint(f) {
  const facts = f || {};
  return supVerdict({
    continue_event: Boolean(facts.continuation_turn_id) && facts.continue_events === 1,
    turn_completed: ['completed', 'completed_with_warnings'].includes(facts.turn_status),
    file_changed: facts.b0_text === 'cont0\n' && facts.b1_text === 'cont1\n',
    checkpoint_owned: Boolean(facts.checkpoint) && supNonEmpty(facts.continuation_turn_id) && supNonEmpty(facts.conversation_id) && facts.checkpoint.turn_id === facts.continuation_turn_id && facts.checkpoint.session_id === facts.conversation_id,
    old_turn_has_no_checkpoint: facts.old_turn_checkpoints === 0,
    in_diff: Array.isArray(facts.review_paths) && facts.review_paths.includes('cont_target.txt'),
    undo_restores: facts.undo_ok === true && facts.b2_text === facts.b0_text,
  });
}
// M3-05: the same journey after a product restart on the same data: nothing was sent or replayed at start, the counts and the files are those the main Stage left,
// the earlier Turn's review is still readable, a second undo of an already undone Turn restores nothing again, and a later Turn goes on.
function evaluateReviewRestart(f) {
  const facts = f || {}; const prior = facts.prior || {}; const before = prior.counts || {}; const counts = facts.counts || {}; const undo = facts.reundo || {}; const outcome = undo.outcome || {};
  const same = (key) => Number.isSafeInteger(counts[key]) && counts[key] === before[key];
  const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length >= 1 && JSON.stringify(a) === JSON.stringify(b);
  const paths = (list) => (Array.isArray(list) ? list.slice().sort() : null);
  return supVerdict({
    same_journey: supNonEmpty(prior.conversation_id) && facts.conversation_id === prior.conversation_id && supNonEmpty(prior.first_turn_id),
    no_request_at_start: facts.requests_at_start === 0 && facts.requests_after_wait === 0,
    no_replay_in_counts: same('turns') && same('tool_starts') && same('approvals') && same('checkpoints') && same('managed'),
    files_as_left: sameList(prior.tree, facts.tree),
    review_readable: facts.review_ok === true && Array.isArray(prior.first_review_paths) && prior.first_review_paths.length >= 1 && JSON.stringify(paths(facts.review_paths)) === JSON.stringify(paths(prior.first_review_paths)),
    undo_not_replayed: undo.ok === true && Array.isArray(outcome.errors) && outcome.errors.length === 0 && Array.isArray(outcome.drifted) && outcome.drifted.length === 0 && Array.isArray(outcome.restored) && outcome.restored.length >= 1
      && outcome.restored.every((e) => typeof e === 'string' && e.endsWith(' (此前已撤销，未重复执行)')) && sameList(prior.tree, facts.tree_after_undo),
    later_turn_continues: ['completed', 'completed_with_warnings'].includes(facts.next_outcome) && supNonEmpty(facts.next_turn_id) && facts.next_turn_id !== prior.first_turn_id && Number.isSafeInteger(facts.next_requests) && facts.next_requests >= 1,
  });
}
// M3-04 (ADR-0243): after the baseline collection a background process writes again; undo keeps the late bytes, names the path as drifted and touches nothing else.
function evaluateLateWrite(f) {
  const facts = f || {};
  return supVerdict({
    baseline_collected: facts.review_ok === true && Array.isArray(facts.review_paths) && facts.review_paths.includes('late_target.txt') && facts.b1_text === 'late1\n',
    late_write_happened: SUP_SHA64.test(facts.b1 || '') && SUP_SHA64.test(facts.late || '') && facts.late !== facts.b1 && facts.late_text === 'late2\n',
    bytes_kept: facts.after_undo === facts.late,
    path_drifted: Array.isArray(facts.drifted_paths) && facts.drifted_paths.includes('late_target.txt'),
    undo_answered: facts.undo_ok === true,
    nothing_else_touched: Array.isArray(facts.tree_before) && JSON.stringify(facts.tree_before) === JSON.stringify(facts.tree_after),
  });
}
// M5 precondition: the system prompt body of the real Provider request, hashed once per request, and the request is only the pinned service and model.
function evaluateSystemPromptBody(f) {
  const facts = f || {}; const bodies = Array.isArray(facts.bodies) ? facts.bodies : [];
  return supVerdict({
    bodies_captured: bodies.length >= 1,
    all_hashed: bodies.length >= 1 && bodies.every((b) => SUP_SHA64.test(b.system_sha256 || '') && Number.isSafeInteger(b.system_chars) && b.system_chars > 0),
    one_body: bodies.length >= 1 && new Set(bodies.map((b) => b.system_sha256)).size === 1,
    model_pinned: bodies.length >= 1 && bodies.every((b) => b.model === facts.expected_model),
    marker_recorded: typeof facts.system_prompt_version === 'string' && facts.system_prompt_version.length > 0,
  });
}
// M5 precondition rehearsal: with a managed process alive, a Provider change is refused with A9_PROVIDER_MANAGED_ACTIVE (an expected rejection, not a failure), and the process is untouched.
function evaluateProviderGuard(f) {
  const facts = f || {};
  return supVerdict({
    process_running: facts.running_before === true,
    refused: facts.attempt_ok === false && facts.attempt_code === 'A9_PROVIDER_MANAGED_ACTIVE',
    process_untouched: facts.running_after === true && Number.isSafeInteger(facts.pid_before) && facts.pid_before > 0 && facts.pid_before === facts.pid_after,
    provider_unchanged: supNonEmpty(facts.model_before) && facts.model_before === facts.model_after && supNonEmpty(facts.base_url_before) && facts.base_url_before === facts.base_url_after,
    no_request_sent: Number.isSafeInteger(facts.requests_before) && facts.requests_before === facts.requests_after,
  });
}
// §4.2: the isolated Electron userData sits inside the run, and holds no A8 database the product would adopt.
function evaluateUserDataIsolation(f) {
  const facts = f || {}; const real = facts.real || {};
  return supVerdict({
    inside_run: supNonEmpty(facts.user_data) && supNonEmpty(facts.run_root) && facts.user_data.toLowerCase().startsWith(facts.run_root.toLowerCase()),
    expected_location: supNonEmpty(facts.expected) && supNonEmpty(facts.user_data) && facts.user_data.toLowerCase() === facts.expected.toLowerCase(),
    no_a8_database: facts.a8_database_exists === false,
    // The same three locations after links are resolved.
    real_inside_run: supNonEmpty(real.run_root) && ['user_data', 'data_root', 'workspace'].every((k) => supNonEmpty(real[k]) && real[k].toLowerCase().startsWith(real.run_root.toLowerCase())),
  });
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
// The Stage modes of the supplement; the orchestrator's closed STAGE_PLAN may name only these (checked by the contract test and again at start).
const SUPPLEMENT_MODES = Object.freeze(['supplement_continue_schema', 'supplement_policy_git', 'supplement_verification', 'supplement_audit_output', 'supplement_audit_managed',
  'supplement_audit_ownership', 'supplement_continue', 'supplement_budget', 'supplement_review', 'supplement_review_restart', 'supplement_provider_guard', 'supplement_real_model']);

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
    return { visible: document.body.innerText, present: document.body.textContent, stream: stream ? stream.textContent : '', outcome: (document.getElementById('a9-turn-outcome') || {}).textContent || '',
      cancelHidden: cancel ? cancel.hidden : null, cancelLabel: cancel ? cancel.textContent : null,
      cards: document.querySelectorAll('section.continuation-card').length, streamScroll: stream ? stream.scrollTop : null };
  })()`);
  // Counts each text in the live-output blocks and in the whole page, and lists where the first texts are rendered (tag, id, class, parent).
  const domOutputCounts = (texts) => exec(`(() => {
    const texts = ${JSON.stringify(texts)};
    const blocks = Array.from(document.querySelectorAll('pre.shell-live-output'));
    const body = document.body.textContent;
    const countIn = (haystack, needle) => haystack.split(needle).length - 1;
    const places = (text) => Array.from(document.querySelectorAll('body *')).filter((node) => Array.from(node.childNodes).some((child) => child.nodeType === 3 && child.textContent.includes(text))).slice(0, 8)
      .map((node) => ({ tag: node.tagName, id: node.id || null, cls: String(node.className || '').slice(0, 60), parent: node.parentElement ? node.parentElement.tagName + '.' + String(node.parentElement.className || '').slice(0, 40) : null }));
    const stream = document.getElementById('a9-task-stream');
    return { live_blocks: blocks.length, per_text: texts.map((text) => ({ text, live: blocks.reduce((sum, block) => sum + countIn(block.textContent, text), 0), body: countIn(body, text) })),
      locations: texts.slice(0, 3).map((text) => ({ text, places: places(text) })), stream_excerpt: stream ? stream.textContent.slice(0, 400) : null };
  })()`);
  // Waits until every text is rendered at least once, holds briefly, then counts again, so a count taken before the page finished rendering is not a verdict.
  async function settledOutputCounts(texts, timeoutMs) {
    const started = Date.now();
    const samples = [];
    let counts = await domOutputCounts(texts);
    samples.push({ t: 0, blocks: counts.live_blocks, live: counts.per_text.map((item) => item.live) });
    while (!counts.per_text.every((item) => item.live >= 1) && Date.now() - started < timeoutMs) {
      await sleep(500);
      counts = await domOutputCounts(texts);
      samples.push({ t: Date.now() - started, blocks: counts.live_blocks, live: counts.per_text.map((item) => item.live) });
    }
    const presentAt = Date.now() - started;
    await sleep(800);
    counts = await domOutputCounts(texts);
    samples.push({ t: Date.now() - started, blocks: counts.live_blocks, live: counts.per_text.map((item) => item.live) });
    return { counts, present_after_ms: presentAt, waited_ms: Date.now() - started, samples: samples.slice(-14), once: evaluateStreamedOnce(counts, texts) };
  }
  // The scrolling element of the task stream is #conversation, not #a9-task-stream.
  const scrollProbe = (toTop) => exec(`(() => { const c = document.getElementById('conversation'); if (!c) return null; if (${toTop === true}) c.scrollTop = 0;
    return { top: c.scrollTop, height: c.scrollHeight, client: c.clientHeight }; })()`);
  const focusProbe = () => exec(`(() => { const a = document.activeElement; const c = document.querySelector('section.continuation-card');
    return { tag: a ? a.tagName : null, cls: a ? String(a.className || '').slice(0, 60) : null, inCard: Boolean(c && a && c.contains(a)) }; })()`);
  // One real key press. The page-side recorder shows whether the press arrived (keydown, keypress with the right char code, keyup); a press that did not
  // arrive is reported, never repeated, so a lost key cannot hide behind a second try.
  const installKeyRecorder = () => exec(KEY_RECORDER_SOURCE);
  const keyRecords = async () => (await exec('window.__b2KeyRecords || []')) || [];
  async function pressKey(key) {
    await installKeyRecorder();
    win.show(); win.focus(); win.webContents.focus();
    const pageFocused = await waitFor(async () => (await exec('document.hasFocus()')) === true, 3000, 'page focus').then(() => true, () => false);
    const fromIndex = (await keyRecords()).length;
    for (const event of keyEventsFor(key)) win.webContents.sendInputEvent(event);
    await waitFor(async () => summarizeKeyPress(await keyRecords(), fromIndex, key).keyup, 1500, 'key reached the page').catch(() => null);
    return { ...summarizeKeyPress(await keyRecords(), fromIndex, key), page_focused: pageFocused, from_index: fromIndex };
  }
  const continueEventsFor = async (conv, taskId) => (await events(conv, 1000)).events.filter((e) => e.eventType === 'task_continue_requested' && eventData(e).taskId === taskId);
  const continueIpcCalls = () => ipcLog.filter((item) => item.action === 'a9.task.continue').length;
  const cardInfo = () => exec(`(() => { const c = document.querySelector('section.continuation-card'); const b = c && c.querySelector('button');
    return c ? { text: c.innerText, button: b ? b.textContent : null, disabled: b ? b.disabled : null } : null; })()`);
  const clickContinue = () => exec(`(() => { const b = document.querySelector('section.continuation-card button'); if (!b) return 'no-card'; b.click(); return 'clicked'; })()`);
  const findRecovery = async (taskId) => ((await snapshot()).recoveryTasks || []).find((item) => item.taskId === taskId) || null;
  const lastTurnOf = (evts) => { const started = evts.filter((e) => e.eventType === 'turn_started'); return started.length ? started[started.length - 1].turnId : null; };

  // A failed WMIC query is counted, never turned into an empty-but-valid process list. Every verdict that reads a process tree
  // checks `wmicFailures` and answers UNKNOWN when any query failed.
  let wmicFailures = 0;
  function wmicRows() {
    const result = childProcess.spawnSync('wmic.exe', ['process', 'get', 'ProcessId,ParentProcessId,Name,CreationDate', '/format:csv'], { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    const lines = String(result.stdout || '').replace(/\r/g, '').split('\n').filter((line) => line.trim());
    if (result.error || result.status !== 0 || lines.length < 2) { wmicFailures += 1; return []; }
    const header = lines[0].split(',');
    const rows = lines.slice(1).map((line) => { const cells = line.split(','); const row = {}; header.forEach((name, index) => { row[name] = cells[index]; }); return row; });
    // The query's own WMIC.exe is a direct child of this process and exists only while the query runs; it is not a process of the product
    // (rehearsal 6, p04 S05-A02: the query after a cancel started a WMIC.exe that the next tree counted as new).
    return rows.filter((row) => !(String(row.Name || '').toLowerCase() === 'wmic.exe' && String(row.ParentProcessId) === String(process.pid)));
  }
  // Links left out of a tree because the child is older than the parent (a stale ParentProcessId), kept as evidence of what was dropped.
  const staleParentLinks = new Map();
  const myTree = () => {
    const stale = [];
    const tree = descendantsOf(wmicRows(), process.pid, stale);
    for (const link of stale) staleParentLinks.set(`${link.pid}:${link.created}`, link);
    return tree;
  };

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
  // The product keeps the API key in process memory only (the suite never asks it to remember the key) and registers it as a known secret
  // when it is entered. A mode that judges the hiding of the secret (S05) therefore has to enter the key in its own driver process: a
  // configured provider with a key that is not available leaves the runtime without a secret to hide, and S05 would test nothing
  // (rehearsal 6, p04: events 129, 130 and 134 held the test secret). Only that mode asks for it (requireKey): the other modes keep the
  // earlier rule, so the restart and recovery journeys of p05 to p08 do not meet a changed provider. The facts below hold no secret value.
  const providerKeyFacts = (snap) => {
    const provider = snap.provider || {};
    const key = provider.apiKey || {};
    return { configured: provider.configured === true, base_url_is_fixture: provider.baseUrl === fixtureUrl, key_available: key.available === true, key_source: key.source || null, key_remembered: key.remembered === true };
  };
  const providerReady = (snap) => { const facts = providerKeyFacts(snap); return facts.configured && facts.base_url_is_fixture && facts.key_available; };
  const providerApplyState = () => exec(`(() => { const apply = document.getElementById('a9-provider-apply'); const error = document.getElementById('a9-provider-error'); const probe = document.getElementById('a9-provider-probe-state');
    return { busy: !apply || apply.disabled || apply.getAttribute('aria-busy') === 'true', error: error && !error.hidden ? String(error.textContent || '') : '', probe: probe ? probe.textContent : null }; })()`);
  async function ensureProvider(options) {
    const requireKey = Boolean(options && options.requireKey);
    if (requireKey && !secretLiteral) throw new Error('A9_BATCH2_DRIVER_SECRET_LITERAL_MISSING');
    const current = await snapshot();
    const settled = requireKey ? providerReady(current) : Boolean(current.provider && current.provider.configured);
    if (settled && (await exec('document.getElementById("a9-provider-probe-state").textContent')) === 'tool_calling') return;
    await exec(`(() => {
      document.getElementById('a9-provider-url').value = ${JSON.stringify(fixtureUrl)};
      document.getElementById('a9-provider-model').value = 'batch2-scripted';
      const key = document.getElementById('a9-provider-key'); if (key) key.value = ${JSON.stringify(secretLiteral)};
      const remember = document.getElementById('a9-provider-remember'); if (remember) remember.checked = false;
      document.getElementById('a9-provider-apply').click();
      return true;
    })()`);
    // The apply ends when the page lets go of the button, after the configuration and its probe have returned and the snapshot is read
    // again. The probe text alone is the text of the earlier probe until then, and the key is registered before the new probe runs
    // (rehearsal 6 review, round 2, N1). The button is disabled inside the click, so the first read already sees it busy.
    await waitFor(async () => {
      const state = await providerApplyState();
      if (state.error) throw new Error(`provider form error: ${state.error}`);
      if (!state.busy && state.probe !== 'tool_calling') throw new Error(`provider probe text: ${state.probe}`);
      return !state.busy;
    }, 45000, 'provider apply finished');
    if (requireKey) await waitFor(async () => providerReady(await snapshot()), 20000, 'provider key available');
    await exec('(() => { const b = document.querySelector(".drawer:not([hidden]) [data-close]"); if (b) b.click(); return true; })()');
  }
  async function bootstrap(options) {
    await waitFor(() => exec('document.readyState === "complete"'), 30000, 'renderer ready');
    await selectWorkspace();
    await ensureMode();
    await ensureProvider(options);
    const snap = await snapshot();
    await setFixture({ shellKind: snap.shell && snap.shell.kind === 'powershell' ? 'powershell' : 'cmd' });
    return snap;
  }
  // The send button is hidden while the renderer still treats a Turn as running, and the prompt is disabled while the composer is blocked.
  // The send button is also disabled while the prompt is empty (canSubmit needs prompt text), so a submission waits in three steps:
  // the composer is open, the text is typed (the input event refreshes the button), the button is enabled. Waiting for an enabled
  // button before typing cannot end (rehearsal 5: p03 stopped at the first submission after 30 s). Every timeout carries the state.
  const composerState = () => exec(`(() => { const send = document.getElementById('run-task'); const prompt = document.getElementById('task-prompt');
    return { send_hidden: send ? send.hidden : null, send_disabled: send ? send.disabled : null, prompt_disabled: prompt ? prompt.disabled : null }; })()`);
  const composerOpen = (state) => Boolean(state) && state.send_hidden === false && state.prompt_disabled === false;
  const sendEnabled = (state) => composerOpen(state) && state.send_disabled === false;
  const waitComposer = (accept, timeoutMs, label) => waitFor(async () => {
    const state = await composerState();
    if (!accept(state)) throw new Error(`composer=${JSON.stringify(state)}`);
    return true;
  }, timeoutMs, label);
  async function submitRaw(prompt) {
    await exec(`(() => { const p = document.getElementById('task-prompt'); p.value = ${JSON.stringify(prompt)}; p.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('run-task').click(); return true; })()`);
  }
  async function submit(prompt) {
    await waitComposer(composerOpen, 30000, 'composer open');
    await exec(`(() => { const p = document.getElementById('task-prompt'); p.value = ${JSON.stringify(prompt)}; p.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await waitComposer(sendEnabled, 30000, 'send enabled');
    await exec(`(() => { document.getElementById('run-task').click(); return true; })()`);
  }
  // Idle means no Turn is running. A managed background process keeps controls.canStop true, so only stopKind 'turn' counts as busy.
  const waitIdle = (timeoutMs, label) => waitFor(async () => { const snap = await snapshot(); return snap.controls && snap.controls.stopKind !== 'turn' && snap.agentStatus !== 'running' ? snap : null; }, timeoutMs, label || 'idle');
  const conversationId = async () => (await snapshot()).activeConversationId;
  async function newConversation() {
    const before = await conversationId();
    let clicked = false;
    let clickError = null;
    // The page can still show the last busy state after a fast Turn has ended. Wait for the real control; never bypass it or click twice.
    return waitFor(async () => {
      if (clickError) throw clickError;
      if (!clicked) {
        try { clicked = await exec('(() => { const b = document.getElementById("conversation-new"); if (!b || b.disabled) return false; b.click(); return true; })()'); }
        catch (error) { clickError = error || new Error('A9_BATCH2_DRIVER_CONVERSATION_CLICK_UNCONFIRMED'); throw clickError; }
      }
      if (!clicked) return null;
      const id = await conversationId();
      return id && id !== before ? id : null;
    }, 20000, 'new conversation');
  }
  // A conversation switch the way a person makes it: click the conversation's row in the sidebar. The preload bridge alone changes the main
  // process only; the page loads the new conversation on its own switch path (rehearsal 6, p05: after a restart the snapshot named the
  // streamed conversation as active for 16 s while the page kept showing the old one). A title that is not unique cannot name one row.
  // A row is named by its own title element (the <strong> of the row), compared whole: a label prefix cannot tell the title "基础" from a
  // row "基础，附录" because the label of every row is "<title>，<status>…" (rehearsal 6 review, round 1).
  const conversationRows = () => exec(`(() => Array.from(document.querySelectorAll('#conversation-list button')).map((b) => { const strong = b.querySelector('strong'); return { title: strong ? strong.textContent : '', label: b.getAttribute('aria-label') || '', current: b.getAttribute('aria-current') === 'true', disabled: b.disabled }; }))()`);
  const conversationTitleOf = (snap, id) => { const item = (snap.conversations || []).find((c) => c.sessionId === id); return item ? (item.title || '新对话') : null; };
  async function switchConversationInUi(id) {
    const snap = await snapshot();
    if (snap.activeConversationId === id) return { method: 'already_active', title: conversationTitleOf(snap, id) };
    const title = conversationTitleOf(snap, id);
    if (title === null) throw new Error(`A9_BATCH2_DRIVER_CONVERSATION_NOT_LISTED:${id}`);
    const same = (snap.conversations || []).filter((c) => c.state === 'active' && (c.title || '新对话') === title);
    if (same.length !== 1) throw new Error(`A9_BATCH2_DRIVER_CONVERSATION_TITLE_NOT_UNIQUE:${title}:${same.length}`);
    const titled = (rows) => rows.filter((row) => row.title === title);
    await waitFor(async () => { const rows = titled(await conversationRows()); return rows.length >= 1 && rows.every((row) => !row.disabled) ? rows : null; }, 30000, `conversation row enabled: ${title}`);
    // The snapshot names one active conversation with this title; a page that shows another number of rows disagrees with it and is a finding.
    const shown = titled(await conversationRows()).length;
    if (shown !== 1) throw new Error(`A9_BATCH2_DRIVER_CONVERSATION_ROW_COUNT:${title}:${shown}`);
    const clicked = await exec(`(() => { const rows = Array.from(document.querySelectorAll('#conversation-list button')).filter((x) => { const strong = x.querySelector('strong'); return strong && strong.textContent === ${JSON.stringify(title)}; }); if (rows.length !== 1 || rows[0].disabled) return false; rows[0].click(); return true; })()`);
    if (!clicked) throw new Error(`A9_BATCH2_DRIVER_CONVERSATION_ROW_NOT_CLICKED:${title}`);
    await waitFor(async () => (await conversationId()) === id, 20000, 'switched conversation');
    await waitFor(async () => { const current = (await conversationRows()).filter((row) => row.current); return current.length === 1 && current[0].title === title ? true : null; }, 20000, `page marks the conversation current: ${title}`);
    return { method: 'ui', title };
  }
  // The bridge call stays only for a conversation the sidebar cannot name (not listed, or a title shared with another conversation).
  async function activateConversation(id) {
    if ((await conversationId()) === id) return { method: 'already_active' };
    try {
      return await switchConversationInUi(id);
    } catch (error) {
      if (!/^A9_BATCH2_DRIVER_CONVERSATION_(NOT_LISTED|TITLE_NOT_UNIQUE):/.test(String(error && error.message))) throw error;
    }
    await exec(`window.win7Agent.a9.activateConversation(${JSON.stringify(id)})`);
    await waitFor(async () => (await conversationId()) === id, 20000, 'activate conversation');
    return { method: 'bridge' };
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
    // The DOM is read first in every sample, then the snapshot, then the stored events. The DOM text is kept until the observation
    // ends, because which frames count as "displayed" is decided against the frames stored by the END (not by this sample's DB read).
    const closeSamples = (frames) => {
      const finalTexts = frames.map((frame) => frame.text).filter((text) => text.trim());
      for (const sample of samples) {
        sample.domFrameTexts = finalTexts.filter((text) => sample._domPresent.includes(text.trim()));
        sample.domTokens = [...new Set(String(sample._domStream).match(OUTPUT_TOKEN_PATTERN) || [])];
        delete sample._domPresent;
        delete sample._domStream;
      }
      return persistedStamps(frames);
    };
    while (Date.now() - started < timeoutMs) {
      const t = Date.now() - started;
      const dom = await domState();
      const domReadEndMs = Date.now();
      const snap = await snapshot();
      const ipcEventIds = (snap.timeline || []).filter((item) => item.type === 'tool_output' && Number.isSafeInteger(item.eventId)).map((item) => item.eventId);
      const evts = (await events(conv, 1000)).events;
      const frames = framesFromEvents(evts);
      samples.push({ t, domFrameTexts: [], domTokens: [], dbFrameTexts: frames.map((frame) => frame.text), ipcEventIds, dbEventIds: frames.map((frame) => frame.eventId), frames: frames.length, outcome: dom.outcome,
        domReadEndMs, _domPresent: dom.present, _domStream: dom.stream || '' });
      if (firstVisible === null && frames.some((frame) => frame.text.trim() && dom.visible.includes(frame.text.trim()))) firstVisible = t;
      if (toolEndedAt === null && evts.some((e) => e.eventType === 'tool_end' && ['shell', 'start_process'].includes(eventData(e).toolName))) toolEndedAt = t;
      if (await done(evts, dom, t)) { const persisted = closeSamples(frames); return { samples, persisted, firstVisible, toolEndedAt, events: evts, dom }; }
      await sleep(150);
    }
    throw new Error(`TIMEOUT:${label}`);
  }
  // Stored timestamps of the persisted frames: the product writes created_at when the event row is inserted.
  function persistedStamps(frames) {
    const stamps = new Map(dbAll("SELECT id, created_at FROM a9_events WHERE event_type = 'tool_output'").map((row) => [row.id, Date.parse(row.created_at)]));
    return frames.map((frame) => ({ eventId: frame.eventId, text: frame.text, persistedAtMs: stamps.get(frame.eventId) }));
  }
  const isTerminalEvent = (e) => e.eventType === 'turn_completed' || e.eventType === 'turn_failed';
  const terminalReached = (evts) => evts.some(isTerminalEvent);
  const newestEventId = (evts) => evts.reduce((max, e) => (Number.isSafeInteger(e.eventId) && e.eventId > max ? e.eventId : max), 0);
  const eventBaseline = async () => newestEventId((await events(await conversationId(), 1000)).events);
  // The end event of the Turn that a prompt starts. The events query returns only the newest 1000 events, so the baseline is the newest
  // event id before the submit (ids only grow), not a count of end events. The first turn_started after the baseline names the Turn;
  // runPrompt keeps that name across polls, because the start event can leave the window while the Turn runs, and only the end event
  // of that Turn counts. Only when no poll has held the start event and the window no longer reaches back to the baseline, the first
  // end event after the baseline is taken.
  const newTurnId = (evts, baselineId) => {
    const started = evts.find((e) => e.eventType === 'turn_started' && e.eventId > baselineId);
    return started ? started.turnId : null;
  };
  const targetTurnEnd = (evts, baselineId, turnId) => {
    const pastBaseline = (e) => isTerminalEvent(e) && e.eventId > baselineId;
    if (turnId) return evts.find((e) => pastBaseline(e) && e.turnId === turnId) || null;
    return evts.length > 0 && evts[0].eventId > baselineId ? evts.find(pastBaseline) || null : null;
  };

  // The previous Turn's end event is persisted before the runtime clears its controller and before the renderer lets go of the Turn,
  // so a prompt waits for idle (no running Turn) and a ready composer instead of failing on the first read (rehearsal 4, p04).
  // The end event waited for is the one of the Turn this prompt starts: the events of a conversation keep the end events of its earlier
  // prompts, so "any end event exists" ends the second and later prompts of one conversation at the submit (rehearsal 6, p04 S04: frames
  // 4, 4, 8, 11).
  async function runPrompt(token, timeoutMs) {
    await waitIdle(30000, `idle before ${token}`);
    const baseline = await eventBaseline();
    await submit(token);
    let turnId = null;
    return observeUntil(async (evts) => {
      turnId = turnId || newTurnId(evts, baseline);
      return Boolean(targetTurnEnd(evts, baseline, turnId));
    }, timeoutMs || 120000, token);
  }

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
      && (manifestEntry('resources/app/product/main.js') || {}).sha256 === mainSha && runtimeJson.candidate === 'WIN7-45' && snap.status === 'ready';
    record('B2-CH-01-START', 1, identityOk ? 'PASS' : 'FAIL', `electron=${process.versions.electron}; abi=${process.versions.modules}; sqlite=${sqliteVersion}; helper_match=${helperSha === manifest.required_native.runner_helper}; sqlite_node_match=${sqliteNodeSha === manifest.required_native.better_sqlite3_node}; status=${snap.status}`);
    // B2-CH-01 A02 (SID, session, integrity, elevation, job, old trees) is decided by the smoke from the controller identity.

    await newConversation();
    const conv = await conversationId();
    const baselineTree = myTree();
    await submit('b2:bg-start');
    const observed = await observeUntil(async (evts, _dom, t) => backgroundObservationDone(framesFromEvents(evts).length, terminalReached(evts), t), 90000, 'background frames');
    const running = (await snapshot()).managedProcesses.filter((item) => ['running', 'starting'].includes(item.lastProbeStatus));
    const frames = framesFromEvents(observed.events);
    const stdoutText = textsPerStream(frames, 'stdout');
    const stderrText = textsPerStream(frames, 'stderr');
    const domOrder = evaluateDomAfterDb(observed.samples, observed.persisted);
    const bgOutput = evaluateBackgroundOutput(observed.samples, running.length, stdoutText, stderrText);
    await screenshot('02-output.png');
    out('02-output-frames.jsonl', `${frames.map((frame) => JSON.stringify(frame)).join('\n')}\n`);
    out('02-background.json', { samples: observed.samples.map((s) => ({ t: s.t, frames: s.frames, domFrames: s.domFrameTexts.length, ipcFrames: s.ipcEventIds.length })), first_visible_ms: observed.firstVisible, background_output: bgOutput,
      running_at_observation: running.map((item) => ({ handleId: item.handleId, pid: item.pid, status: item.lastProbeStatus })), dom_after_db: domOrder,
      stdout_head: stdoutText.slice(0, 120), stderr_head: stderrText.slice(0, 120) });
    record('B2-CH-02-BACKGROUND', 1, statusOf(withGuard(bgOutput.ok, domOrder.ok)),
      `first_ipc_ms=${bgOutput.first_ipc_ms}; ipc_frames_max=${bgOutput.ipc_frames_max}; dom_frames_max=${bgOutput.dom_frames_max} (KL-3: page display after the Turn end is recorded, not asserted); running_processes=${running.length}; stdout_has_tick=${bgOutput.stdout_has_tick}; stderr_has_err=${bgOutput.stderr_has_err}; dom_after_db_violations=${domOrder.violations.length}; observations=${domOrder.observations}`);
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
    out('03-process-tree.json', { before: treeBefore, survivors, after_total: treeAfter.length, stale_parent_links: Array.from(staleParentLinks.values()) });
    out('03-held-exit.json', { handle: handle ? handle.handleId : null, fact_after: factAfter || null });
    const noneActive = idle.managedProcesses.every((item) => !['running', 'starting', 'running_unknown', 'identity_mismatch'].includes(item.lastProbeStatus));
    const lastFrame = frames[frames.length - 1];
    // An empty command tree means the processes were not observed, so a missing survivor would prove nothing.
    const stopVerdict = survivors.length > 0 || !noneActive || feedback.ms > 3000 ? 'FAIL' : treeBefore.length === 0 || wmicFailures > 0 ? 'UNKNOWN' : 'PASS';
    record('B2-CH-03-STOP', 1, stopVerdict,
      `feedback_ms=${feedback.ms}; command_tree_before=${treeBefore.length}; wmic_failures=${wmicFailures}; survivors=${survivors.length}; active_after=${!noneActive}; frames_before_stop=${frames.length}; last_frame_seq=${lastFrame ? lastFrame.outputSeq : 'none'}`);
    const stopSchema = providerLines().map((entry) => entry.tool_params && entry.tool_params.stop_process).filter(Boolean)[0];
    const noCleanup = idle.managedProcesses.every((item) => item.cleanupRequired !== true);
    record('B2-CH-03-STOP', 2, Array.isArray(stopSchema) && stopSchema.length === 1 && stopSchema[0] === 'handleId' && noCleanup ? 'PASS' : stopSchema ? 'FAIL' : 'UNKNOWN',
      `stop_process_params=${JSON.stringify(stopSchema)}; cleanup_required_residue=${!noCleanup}`);
  }

  const chainInterrupt = () => interruptAt('approval', '04-interruption-pre.json');

  // The B2-CH-04 answers of the restart phase; a counter or Turn status that was not read is UNKNOWN (codex round 5, R2).
  function recordInterruptChecks(pre, facts) {
    const verdicts = evaluateInterruptRecords(pre, facts);
    record('B2-CH-04-INTERRUPT-RESTART', 1, verdicts[0].status, verdicts[0].detail);
    record('B2-CH-04-INTERRUPT-RESTART', 2, verdicts[1].status, verdicts[1].detail);
  }

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
    recordInterruptChecks(pre, facts);

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
    // Stop on a continuation turn that did not finish leaves the task retryable: the product writes task, turn and run as
    // `interrupted` (persistTurnResult, retryable continuation) and shows a new enabled card; only `interrupted` is accepted.
    const afterTask = Array.isArray(idle.recoveryTasks) ? idle.recoveryTasks.find((item) => item.taskId === pre.taskId) || null : null;
    const actionable = stopLeavesActionableCard({ interruptedTurnId: pre.turnId, recoveryRevision: facts.recovery.recoveryRevision }, afterTask);
    const stoppedRetryable = withGuard(retryableStopStatus(newStatus), actionable);
    record('B2-CH-05-CONTINUE', 2, approvalDead && factsDelivered ? statusOf(stoppedRetryable) : 'FAIL',
      `old_approval_ok=${resume && resume.ok}; old_approval_error=${resume && resume.error && resume.error.code}; file_still_exists=${fileStillThere}; recovery_unknown_results=${unknownCount}; first_request_recovery_unknown=${firstLine.recovery_unknown_count}; new_turn_status_after_stop=${newStatus}; new_card_actionable=${actionable}`);
  }

  async function chainExit() {
    await bootstrap();
    await newConversation();
    await submit('b2:bg-start');
    await waitFor(async () => framesFromEvents((await events(await conversationId(), 1000)).events).length >= 2, 90000, 'frames before exit');
    const snap = await snapshot();
    const running = snap.managedProcesses.filter((item) => ['running', 'starting'].includes(item.lastProbeStatus));
    const tree = myTree();
    out('chain-exit-tree-before.json', { driver_pid: process.pid, tree, stale_parent_links: Array.from(staleParentLinks.values()), wmic_failures: wmicFailures, running: running.map((item) => ({ handleId: item.handleId, pid: item.pid })) });
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
    const second = await runPrompt('b2:s02');
    const allFrames = framesFromEvents(second.events);
    const callFrames = allFrames.filter((frame) => frame.toolCallId === (allFrames[allFrames.length - 1] || {}).toolCallId);
    const order = evaluateStreamOrder(callFrames);
    const outLines = textsPerStream(callFrames, 'stdout');
    const errLines = textsPerStream(callFrames, 'stderr');
    const streamsOk = [1, 2, 3, 4].every((n) => outLines.includes(`out ${n}`) && errLines.includes(`err ${n}`))
      && outLines.indexOf('out 1') < outLines.indexOf('out 4') && errLines.indexOf('err 1') < errLines.indexOf('err 4');
    out('s02-stream-order.json', { order, frames: callFrames, stdout: outLines, stderr: errLines });
    record('B2-S02-STREAM-ORDER', 1, order.ok && streamsOk ? 'PASS' : 'FAIL', `ordered=${order.ok}; frames=${order.frames}; problems=${JSON.stringify(order.problems)}; both_streams_complete=${streamsOk}`);
    const merged = evaluateDomAfterDb([...first.samples, ...second.samples], [...(first.persisted || []), ...(second.persisted || [])]);
    out('s03-sqlite-before-ipc.json', merged);
    record('B2-S03-SQLITE-BEFORE-IPC', 1, statusOf(merged.ok), `observations=${merged.observations}; violations=${merged.violations.length}; unchecked_without_timestamp=${merged.unchecked_without_timestamp}; samples=${merged.samples}`);
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
      const gating = ENCODING_GATING.includes(label);
      try {
        const observed = await runPrompt(`b2:s04-${label}`);
        const frames = framesFromEvents(observed.events);
        const last = frames.filter((frame) => frame.toolCallId === (frames[frames.length - 1] || {}).toolCallId);
        const text = last.map((frame) => frame.text).join('');
        const callId = last.length > 0 ? last[0].toolCallId : null;
        const warnings = callId ? Array.from(new Set(observed.events.filter((event) => event.eventType === 'tool_output' && eventData(event).toolCallId === callId)
          .map((event) => eventData(event).warning).filter(Boolean))) : [];
        outcomes.push({ label, expected, gating, ok: text.includes(expected), got_head: text.slice(0, 120), frames: last.length, warnings });
      } catch (error) {
        // CP936 and UTF-16LE are evidence for KL-5 only: a failed informational run is recorded, a failed gating run stays an error.
        if (gating) throw error;
        outcomes.push({ label, expected, gating, ok: false, got_head: '', frames: 0, warnings: [], error: String(error && error.message ? error.message : error).slice(0, 200) });
      }
      await sleep(400);
    }
    const verdict = evaluateEncodingOutcomes(outcomes);
    out('s04-encoding.json', { shell: snap.shell, known_limit: 'KL-5: only UTF-8 and CRLF decide the verdict; CP936 and UTF-16LE are INFORMATIONAL', outcomes, verdict });
    record('B2-S04-ENCODING-CROSSCHUNK', 1, verdict.status, verdict.text);
  }

  async function streamLimits() {
    await bootstrap({ requireKey: true });
    await newConversation();
    const conv = await conversationId();
    const limit = await runPrompt('b2:s05-limit', 180000);
    const limitFrames = framesFromEvents(limit.events);
    const limitOrder = evaluateStreamOrder(limitFrames);
    const truncated = limitFrames.some((frame) => frame.truncated) || limit.events.some((e) => e.eventType === 'tool_end' && /trunc/i.test(JSON.stringify(eventData(e))));
    await sleep(400);
    const keyBeforeSecret = providerKeyFacts(await snapshot());
    const secret = await runPrompt('b2:s05-secret');
    const snapJson = JSON.stringify(await snapshot());
    const allEvents = JSON.stringify((await events(conv, 1000)).events);
    const dom = await domState();
    const leaks = { events: secretLeak(allEvents, secretLiteral), dom: secretLeak(dom.present, secretLiteral), snapshot: secretLeak(snapJson, secretLiteral) };
    const secretFrames = framesFromEvents(secret.events).filter((frame) => frame.toolCallId !== (limitFrames[0] || {}).toolCallId);
    const produced = secretFrames.length > 0;
    const secretCheck = evaluateSecretCheck({ key_available: keyBeforeSecret.key_available, leaks, truncated, produced });
    record('B2-S05-LIMITS-SECRET-BACKPRESSURE', 1, secretCheck.status,
      `truncation_reported=${truncated}; secret_frames=${secretFrames.length}; leaks=${JSON.stringify({ events: leaks.events.leaked, dom: leaks.dom.leaked, snapshot: leaks.snapshot.leaked })}; secret_configured=${leaks.events.checked}; key_available_before_prompt=${keyBeforeSecret.key_available}; key_source=${keyBeforeSecret.key_source}`);
    await sleep(400);
    const baselineTree = myTree();
    await submit('b2:s05-cancel');
    await waitFor(async () => framesFromEvents((await events(conv, 1000)).events).some((frame) => /alive/.test(frame.text)), 90000, 'cancel target running');
    const midTree = myTree();
    await exec('document.getElementById("cancel-task").click(); true');
    const idle = await waitIdle(90000, 'cancelled');
    await sleep(1500);
    const afterTree = myTree();
    const extra = newProcesses(baselineTree, afterTree);
    out('s05-limits-secret.json', { limit: { frames: limitFrames.length, order: limitOrder, truncated }, secret: { frames: secretFrames.length, leaks, key_before_prompt: keyBeforeSecret },
      cancel: { baseline_tree: baselineTree.length, mid_tree: midTree.length, after_tree: afterTree.length, new_processes_after_cancel: extra, status: idle.agentStatus } });
    const s05Status = !limitOrder.ok || extra.length > 0 ? 'FAIL' : wmicFailures > 0 ? 'UNKNOWN' : midTree.length > baselineTree.length ? 'PASS' : 'FAIL';
    record('B2-S05-LIMITS-SECRET-BACKPRESSURE', 2, s05Status,
      `limit_frames=${limitFrames.length}; sequence_ok=${limitOrder.ok}; tree=${baselineTree.length}->${midTree.length}->${afterTree.length}; new_processes_after_cancel=${extra.length}; wmic_failures=${wmicFailures}`);
  }

  async function auditStop() {
    await bootstrap();
    await newConversation();
    const conv = await conversationId();
    // Three reads with the same arguments end the Turn as stuck (loop detector, three identical calls), so each read names its own file.
    const { AUDIT_READ_FILES } = require(path.join(candidateRoot, 'validation', 'a9-batch2-fixtures.cjs'));
    for (const file of AUDIT_READ_FILES) fs.writeFileSync(path.join(workspaceRoot, file), `b2 audit read target ${file}\n`, 'utf8');
    try {
      const db = openDb(false);
      try { db.exec("CREATE TRIGGER b2_audit_fail BEFORE INSERT ON a9_events WHEN NEW.event_type = 'turn_completed' BEGIN SELECT RAISE(FAIL, 'b2 injected audit failure'); END"); } finally { db.close(); }
    } catch (error) {
      record('B2-S03T-TERMINAL-AUDIT', 1, 'UNKNOWN', `audit failure could not be injected: ${String(error && error.message ? error.message : error).slice(0, 200)}`);
      return;
    }
    try {
      const c0 = await counters();
      const ipcFrom = ipcLog.length;
      await submit('b2:audit-three');
      await waitFor(async () => { const s = await snapshot(); return s.controls.canStop === false && s.agentStatus !== 'running' ? s : null; }, 120000, 'audit turn settled');
      await sleep(1500);
      const c1 = await counters();
      const evts = (await events(conv, 1000)).events;
      const turnId = lastTurnOf(evts);
      const starts = evts.filter((e) => e.turnId === turnId && e.eventType === 'tool_start').length;
      const completed = evts.some((e) => e.turnId === turnId && e.eventType === 'turn_completed');
      // The follow-up is the observation: after a stopped audit the product may refuse it, so the click is not preceded by a wait; the composer state is recorded.
      const composerBefore = await composerState();
      await submitRaw('b2:s01');
      await sleep(4000);
      const c2 = await counters();
      const evts2 = (await events(conv, 1000)).events;
      const laterShell = evts2.filter((e) => e.eventType === 'tool_start' && eventData(e).toolName === 'shell').length;
      const dom = await domState();
      const submitCalls = ipcLog.slice(ipcFrom).filter((item) => item.action === 'a9.turn.submit').map((item) => ({ ok: item.ok === true, error: item.error }));
      const verdict = evaluateTerminalAudit({ tool_starts: starts, turn_completed: completed, requests: { before: c0.requests, after_turn: c1.requests, after_next_submit: c2.requests },
        later_shell_dispatches: laterShell, submit_calls: submitCalls });
      out('s03t-terminal-audit.json', { requests: { before: c0.requests, after_turn: c1.requests, after_next_submit: c2.requests }, tool_starts_in_turn: starts, turn_completed_persisted: completed,
        later_shell_dispatches: laterShell, submit_calls: submitCalls, outcome_text: dom.outcome, turn_status: turnStatus(turnId), composer_before_next_submit: composerBefore, verdict });
      record('B2-S03T-TERMINAL-AUDIT', 1, verdict.status, verdict.detail);
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
    const refreshView = await settledOutputCounts(texts, 15000);
    await screenshot('s06-after-refresh.png');
    const onceEach = texts.map((text, index) => ({ text, count: refreshView.counts.per_text[index].live, page_count: refreshView.counts.per_text[index].body }));
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
    const part = { conversationId: conv, other_conversation: other, texts, once_each_after_refresh: onceEach, refresh_view: refreshView, paging, view_return_ok: returned };
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

    // BG-03 A01: double stop, a command that exits at once, a start that fails. The release is judged in release_exit (A02, after the exit).
    await newConversation();
    const convStop = await conversationId();
    await submit('b2:bg-stop-twice');
    await waitIdle(180000, 'bg-stop turn');
    const stopEvents = (await events(convStop, 1000)).events;
    const stops = toolEndsFor(stopEvents, 'stop_process');
    const snapStop = await snapshot();
    const knownHandles = new Set(snapStop.managedProcesses.map((item) => item.handleId));
    // Rehearsal 4 read residue=1 and kept no item, so the cause is UNKNOWN. A lagging status of a fast-ending process is one candidate.
    // Residue is therefore judged after a bounded settle (20 s), and the first read, every later read and the settled facts are all recorded.
    const settleResidue = async () => {
      const settle = [];
      const settleStarted = Date.now();
      let snap = await snapshot();
      settle.push({ t: 0, residue: managedResidueItems(snap.managedProcesses).map(managedFactSummary) });
      while (managedResidueItems(snap.managedProcesses).length > 0 && Date.now() - settleStarted < 20000) {
        await sleep(500);
        snap = await snapshot();
        settle.push({ t: Date.now() - settleStarted, residue: managedResidueItems(snap.managedProcesses).map(managedFactSummary) });
      }
      const residue = managedResidueItems(snap.managedProcesses);
      const newFacts = snap.managedProcesses.filter((item) => !knownHandles.has(item.handleId));
      for (const item of snap.managedProcesses) knownHandles.add(item.handleId);
      return { snap, residue, newFacts, settle: settle.slice(-30), settled_after_ms: residue.length === 0 ? settle[settle.length - 1].t : null };
    };
    const fastOutcome = async (token, label) => {
      // KL-3: page polling ends with the Turn, before its background process may exit.
      // Reload the real renderer before each independent probe; its normal directory guards still decide whether a click is allowed.
      await reloadRenderer();
      await newConversation();
      const convId = await conversationId();
      await submit(token);
      await waitIdle(180000, `${label} turn`);
      const ends = toolEndsFor((await events(convId, 1000)).events, 'start_process');
      const settled = await settleResidue();
      return { ends, ...settled };
    };
    const fast = await fastOutcome('b2:bg-fast-exit', 'bg-fast-exit');
    const bad = await fastOutcome('b2:bg-badcwd', 'bg-badcwd');
    const verdict = evaluateBg03Facts({ stops, afterStopFacts: snapStop.managedProcesses, fast: { ends: fast.ends, newFacts: fast.newFacts, residue: fast.residue }, bad: { ends: bad.ends, newFacts: bad.newFacts, residue: bad.residue } });
    out('bg03-stop-release.json', { stops: stops.map(summarizeToolEnd), after_stop_facts: snapStop.managedProcesses.map((item) => ({ handleId: item.handleId, status: item.lastProbeStatus, ownership: item.ownershipState })),
      fast_exit: { start_ends: fast.ends.map(summarizeToolEnd), new_facts: fast.newFacts.map(managedFactSummary), residue_items: fast.residue.map(managedFactSummary), settle_samples: fast.settle, settled_after_ms: fast.settled_after_ms },
      failed_start: { path: verdict.path, known_paths: BAD_CWD_PATHS, start_ends: bad.ends.map(summarizeToolEnd), new_facts: bad.newFacts.map(managedFactSummary), residue_items: bad.residue.map(managedFactSummary), settle_samples: bad.settle, settled_after_ms: bad.settled_after_ms },
      all_facts_at_end: bad.snap.managedProcesses.map(managedFactSummary), verdict: { status: verdict.status, text: verdict.text } });
    record('B2-BG-03-STOP-RELEASE-EXIT', 1, verdict.status, `${verdict.text}; release=judged_by_release_exit_A02`);
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
    // After a restart the page opens on the conversation that was active before the exit; the streamed conversation is opened the way a person
    // opens it, from the sidebar. Rows and page marker are recorded before and after, so a page that does not follow shows what it shows.
    const rowsBefore = await conversationRows();
    const switched = await activateConversation(part.conversationId);
    const restartView = await settledOutputCounts(part.texts, 15000);
    await screenshot('s06-after-restart.png');
    const rowsAfter = await conversationRows();
    const restartSnap = await snapshot();
    const frames = framesFromEvents((await events(part.conversationId, 1000)).events);
    const restartTexts = frames.map((frame) => frame.text.trim()).filter(Boolean);
    const sameRows = JSON.stringify(restartTexts) === JSON.stringify(part.texts);
    const once = part.texts.map((text, index) => ({ text, count: restartView.counts.per_text[index].live, page_count: restartView.counts.per_text[index].body }));
    const refreshOnce = part.refresh_view ? part.refresh_view.once === true : false;
    const restartOnce = restartView.once === true;
    out('s06-refresh-paging.json', { part1: part, restart: { rows_equal: sameRows, once_each: once, view: restartView, active_conversation_is_streamed: restartSnap.activeConversationId === part.conversationId,
      timeline_tool_output_rows: (restartSnap.timeline || []).filter((item) => item.type === 'tool_output').length,
      switch: switched, sidebar_before: rowsBefore.map((row) => ({ label: row.label.slice(0, 60), current: row.current })), sidebar_after: rowsAfter.map((row) => ({ label: row.label.slice(0, 60), current: row.current })) }, refresh_once: refreshOnce, paging_ok: part.paging.ok, view_return_ok: part.view_return_ok });
    record('B2-S06-REFRESH-PAGING-RESTART', 1, refreshOnce && restartOnce && part.paging.ok && part.view_return_ok && sameRows ? 'PASS' : 'FAIL',
      `refresh_once=${refreshOnce}; paging=${part.paging.ok}; view_return=${part.view_return_ok}; restart_rows_equal=${sameRows}; restart_once=${restartOnce}`);
  }

  // BG-03 A02: the owner chooses "leave to system" in the exit dialog. The suite clicks the second button; this mode records what only the
  // product can show (the process tree before the exit, the dialog, the ownership events). The smoke judges the rest after the exit
  // (exit code, the released process still alive, no product process left, then removal of the released process by identity).
  async function releaseExit() {
    await bootstrap();
    await newConversation();
    const baselineTree = myTree();
    await submit('b2:bg-release');
    const handle = await waitFor(async () => (await snapshot()).managedProcesses.find((item) => ['running', 'starting'].includes(item.lastProbeStatus)) || null, 90000, 'released-hold handle');
    await waitIdle(120000, 'bg-release turn');
    const snap = await snapshot();
    const active = snap.managedProcesses.filter((item) => ['running', 'starting'].includes(item.lastProbeStatus));
    const infrastructure = (item) => /^(electron|conhost|spike02_helper)\.exe$/i.test(item.name || '');
    const tree = myTree();
    const commandTree = newProcesses(baselineTree, tree).filter((item) => !infrastructure(item));
    const live = active.find((item) => item.handleId === handle.handleId) || null;
    out('release-exit-before.json', { driver_pid: process.pid, handle: live ? { handleId: live.handleId, pid: live.pid, status: live.lastProbeStatus, ownership: live.ownershipState || null } : null,
      active_count: active.length, tree, command_tree: commandTree, handle_pid_in_command_tree: live ? commandTree.some((item) => item.pid === live.pid) : false,
      stale_parent_links: Array.from(staleParentLinks.values()), wmic_failures: wmicFailures });
    const writeDone = () => writeJson(resultFile, { schema_version: 1, mode: MODE, status: 'DONE', error: null, assertions: results, evidence: evidenceIndex, ipc: ipcLog.slice(-50), dialogs: dialogLog, duration_ms: Date.now() - startedAt });
    const dumpOwnership = (trigger) => {
      let rows = null;
      let factAfter = null;
      let error = null;
      try {
        rows = dbAll("SELECT id, created_at, payload_json FROM a9_events WHERE event_type = 'managed_process_ownership' ORDER BY id");
        factAfter = dbAll('SELECT handle_id, pid, last_probe_status, pid_reuse_possible FROM a9_managed_processes WHERE handle_id = ?', handle.handleId)[0] || null;
      } catch (readError) { error = String(readError && readError.message ? readError.message : readError).slice(0, 300); }
      const sequence = evaluateReleaseSequence(rows, handle.handleId);
      out('release-ownership-events.json', { read_at: new Date().toISOString(), trigger, handle_id: handle.handleId, read_error: error, sequence, fact_after: factAfter });
      writeDone();
    };
    ownsExit = true;
    const dialogTimer = setTimeout(() => {
      out('release-dialog-response.json', { dialog: null, timed_out: true, active_managed_before_quit: active.length });
      writeDone();
      app.exit(1);
    }, 150000);
    let willQuitSeen = false;
    app.on('will-quit', () => { willQuitSeen = true; dumpOwnership('will-quit'); });
    onDialogReturned = (entry) => {
      clearTimeout(dialogTimer);
      out('release-dialog-response.json', exitDialogFacts(entry, active.length));
      writeDone();
      // The release runs before the product quits; when it never reaches will-quit (an error box blocks the exit), the events are read here and the driver stops.
      setTimeout(() => { if (!willQuitSeen) { dumpOwnership('after-dialog-timeout'); app.exit(1); } }, 90000);
    };
    app.quit();
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
    const zeroAdded = evaluateRestartCounts(pre, facts);
    out('cont01-restart.json', { zero_added: zeroAdded, counters: { kill: pre.counters.requests, after_boot: facts.afterBoot.requests, after_refresh: facts.afterRefresh.requests, before_click: before.requests, after_settle: after.requests },
      double_click: first, continue_events: requested.length, new_turns: newTurns, old_turn_status: { before: facts.state2.turn, after: oldStatusAfter } });
    writeJson(path.join(attemptDir, 'cont03-part-approval.json'), { old_approval_ok: approvalResult && approvalResult.ok, old_approval_error: approvalResult && approvalResult.error && approvalResult.error.code, file_still_exists: fileStillThere });
    record('B2-CONT-01-RESTART-ZERO-REQUEST', 1, statusOf(withGuard(requested.length === 1 && newTurns.length === 1, zeroAdded)),
      `zero_added=${zeroAdded === null ? 'not observed' : zeroAdded}; double_click_continue_events=${requested.length}; new_turns=${newTurns.length}; (single click: see B2-CH-05-CONTINUE)`);
    record('B2-CONT-01-RESTART-ZERO-REQUEST', 2, statusOf(evaluateOldTurnUnchanged(facts.state2.turn, oldStatusAfter)), `old_turn_status_before=${facts.state2.turn}; after=${oldStatusAfter}`);
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
      subs.push(subResult('residue', withGuard(Boolean(blockedRecovery) && blockedRecovery.canContinue === false && blockedRecovery.blockedReason === 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED'
        && Boolean(blockedCard) && blockedCard.disabled === true && note.residue.card_text_names_reason,
        guardRefused(blocked.result, 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED', blocked.requests, blocked.continueEvents)),
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
  // The product reads the mode settings file once, when it opens the workspace at startup (restoreActiveWorkspace). The smoke therefore corrupts the file
  // BEFORE it launches this mode and restores the original bytes after the process is gone; corrupting it from here, after startup, only reaches the
  // continue-time drift check (rehearsal 4: mode_after_open=full_access, error A9_CONTINUE_MODE_DRIFT).
  async function continueModeGuard() {
    const pre = readJsonFile('cont-unknown-pre.json');
    const subs = [];
    const note = {};
    const found = findModeSettingsFile(dataRoot);
    note.settings_files = found.count;
    note.smoke_reported_corruption = env.A9_BATCH2_MODE_SETTINGS_CORRUPTED || null;
    if (!found.file) {
      subs.push(subResult('mode_diagnostics', null, `expected exactly one mode settings file, found ${found.count}`));
      out('cont03-part-mode.json', { subs, note });
      return;
    }
    note.settings_corrupt_at_start = fs.readFileSync(found.file, 'utf8') === CORRUPT_MODE_SETTINGS;
    if (!note.settings_corrupt_at_start) {
      subs.push(subResult('mode_diagnostics', null, 'the mode settings file was not corrupt when the product started; the unresolved-mode guard cannot be judged'));
      out('cont03-part-mode.json', { subs, note });
      return;
    }
    try {
      await waitFor(() => exec('document.readyState === "complete"'), 30000, 'renderer ready');
      await selectWorkspace();
      const snap = await snapshot();
      note.mode_after_open = snap.mode === undefined ? 'undefined' : snap.mode;
      note.mode_diagnostics_in_snapshot = snap.modeDiagnostics || null;
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
    }
    out('cont03-part-mode.json', { subs, note, corruption: 'the mode settings file was replaced by truncated JSON by the smoke before this process started, and is restored by the smoke from its original bytes after this process exits' });
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
      const ipcFrom = ipcLog.length;
      await submit('b2:audit-write');
      await waitFor(async () => { const s = await snapshot(); return s.controls.canStop === false && s.agentStatus !== 'running' ? s : null; }, 120000, 'audit write settled');
      await sleep(1500);
      const c1 = await counters();
      const fileWritten = fs.existsSync(path.join(workspaceRoot, 'b2-audit.txt'));
      const evts = (await events(conv, 1000)).events;
      const turnId = lastTurnOf(evts);
      const toolEnds = evts.filter((e) => e.turnId === turnId && e.eventType === 'tool_end').length;
      const row = dbAll('SELECT status, outcome_json FROM a9_turns WHERE turn_id = ?', turnId)[0] || {};
      const composerBefore = await composerState();
      await submitRaw('b2:s01');
      await sleep(4000);
      const c2 = await counters();
      const dom = await domState();
      const submitCalls = ipcLog.slice(ipcFrom).filter((item) => item.action === 'a9.turn.submit').map((item) => ({ ok: item.ok === true, error: item.error }));
      // The Provider log has one line per counted request; a line whose tool_messages is above zero carries a tool result, so it was sent after a tool ended.
      const providerWindow = providerLines().filter((entry) => entry.index > c0.requests);
      const providerFacts = { requests: providerWindow.length, tool_result_requests: providerWindow.every((entry) => isCount(entry.tool_messages)) ? providerWindow.filter((entry) => entry.tool_messages > 0).length : null };
      const pageShowsCode = /A9_AUDIT_PERSISTENCE_FAILED|auditIncomplete/.test(String(dom.present));
      const outcomeHasCode = /A9_AUDIT_PERSISTENCE_FAILED|auditIncomplete/.test(String(row.outcome_json || ''));
      const verdict = evaluateAuditHardStop({ file_written: fileWritten, tool_ends: toolEnds, turn_status: row.status || null, submit_calls: submitCalls,
        requests: { before: c0.requests, after_turn: c1.requests, after_next_submit: c2.requests }, provider_window: providerFacts, page_shows_code: pageShowsCode, outcome_json_has_code: outcomeHasCode });
      out('safe02-audit-hard-stop.json', { file_written_on_disk: fileWritten, tool_end_events_persisted: toolEnds, turn_status: row.status || null, outcome_json: String(row.outcome_json || '').slice(0, 400),
        requests: { before: c0.requests, after_turn: c1.requests, after_next_submit: c2.requests }, provider_window: providerFacts, submit_calls: submitCalls, page_shows_code: pageShowsCode, outcome_json_has_code: outcomeHasCode,
        page_visible_tail: String(dom.visible || '').slice(-600), outcome_text: dom.outcome, composer_before_next_submit: composerBefore, verdict });
      record('B2-SAFE-02-AUDIT-HARD-STOP', 1, verdict.status, verdict.detail);
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
      const buttonFocused = (await exec(`(() => { const b = document.querySelector('section.continuation-card button'); b.focus({ preventScroll: true }); return document.activeElement === b; })()`)) === true;
      const enterDelivery = await pressKey('Enter');
      const busy = await waitFor(async () => { const c = await cardInfo(); return c && c.button === CARD_BUTTON_BUSY ? c : null; }, 8000, 'busy label').catch(() => null);
      await sleep(1200);
      const focus = await focusProbe();
      const scroll1 = await scrollProbe(false);
      const eventsBusy = await continueEventsFor(pre.conversationId, pre.taskId);
      const extraEnter = await pressKey('Enter');
      const extraSpace = await pressKey('Space');
      await sleep(800);
      const eventsExtra = await continueEventsFor(pre.conversationId, pre.taskId);
      await screenshot('ui01-interaction.png');
      facts.enter = { button_focused: buttonFocused, busy_label: Boolean(busy), button_disabled: busy ? busy.disabled === true : null, focus_in_card: focus.inCard, focus_element: focus.tag,
        scroll: scroll0 && scroll1 ? { testable: scroll0.height - scroll0.client >= 60, before: scroll0.top, after: scroll1.top, height: scroll0.height, client: scroll0.client } : null,
        continue_events_while_busy: eventsBusy.length, continue_events_after_extra_keys: eventsExtra.length,
        enter_delivery: enterDelivery, extra_enter: extraEnter, extra_space: extraSpace, key_records: (await keyRecords()).slice(0, 60) };
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
      facts.space_delivery = await pressKey('Space');
      await waitFor(async () => (await continueEventsFor(pre.conversationId, pre.taskId)).length >= 2, 30000, 'second continue event');
      await waitIdle(120000, 'space retry turn');
      const all = await continueEventsFor(pre.conversationId, pre.taskId);
      const lastTurn = all.length ? all[all.length - 1].turnId : null;
      facts.space = { continue_events_total: all.length, ipc_continue_calls_total: continueIpcCalls(), second_turn_status: lastTurn ? turnStatus(lastTurn) : null, continue_turns: all.map((e) => e.turnId) };
    });
    win.setContentSize(1366, 768);

    const subs = evaluateUiJourney(facts);
    const verdict = summarizeSubs(subs);
    out('ui01-interaction.json', { facts, subs, notes, keyboard: 'Enter and Space via webContents.sendInputEvent (keyDown, char with the typed character, keyUp), checked by a page-side recorder', window_height_for_scroll_test: 520 });
    record('B2-UI-01-CONTINUE-INTERACTION', 1, verdict.status, `${verdict.text}${notes.errors.length ? `; step_errors=${notes.errors.length}` : ''}`);
  }

  async function uiLayouts() {
    await bootstrap();
    await newConversation();
    // The continuation card is part of what the layouts must keep usable: the same persisted-fact injection as the guard
    // journeys gives this conversation one interrupted task, hence one card, without a crash or a Provider request.
    const conv = await conversationId();
    const cardFacts = { injected: false, card_found: false };
    try {
      const db = openDb(false);
      try { insertInterruptedTask(db, conv, 'b2-ui02-task', 'b2-ui02-old-turn'); } finally { db.close(); }
      cardFacts.injected = true;
      await reloadRenderer();
      await activateConversation(conv);
      await waitFor(async () => (await domState()).cards > 0, 30000, 'ui02 continue card');
      cardFacts.card_found = true;
    } catch (error) {
      cardFacts.error = String(error && error.message ? error.message : error).slice(0, 200);
    }
    const rows = [];
    for (const zoom of [1, 1.25]) {
      win.setContentSize(1366, 768);
      win.webContents.setZoomFactor(zoom);
      await sleep(600);
      for (const rail of [false, true]) {
        for (const inspector of [false, true]) {
          // Both toggles flip on click, and aria-expanded is kept in step with the state in desktop and drawer mode alike; click only when the state differs from the wanted one.
          await exec(`(() => { const isOpen = (id) => { const b = document.getElementById(id); return Boolean(b) && b.getAttribute('aria-expanded') === 'true'; };
            const nav = document.getElementById('open-navigation'); if (nav && isOpen('open-navigation') !== ${!rail}) nav.click();
            const ins = document.getElementById('open-inspector'); if (ins && isOpen('open-inspector') !== ${inspector}) ins.click(); return true; })()`);
          await sleep(500);
          const probe = await exec(`(() => {
            const ids = ['task-prompt', 'run-task', 'cancel-task'];
            const out = {};
            const cardButton = document.querySelector('section.continuation-card button');
            if (cardButton) cardButton.scrollIntoView({ block: 'nearest' });
            if (!cardButton) out.card_button = null;
            else { const r = cardButton.getBoundingClientRect();
              const hit = r.width > 0 && r.height > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
              out.card_button = { hidden: cardButton.hidden || r.width === 0, inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight, reachable: Boolean(hit && (hit === cardButton || cardButton.contains(hit))), disabled: Boolean(cardButton.disabled) }; }
            for (const id of ids) { const el = document.getElementById(id); if (!el) { out[id] = null; continue; } const r = el.getBoundingClientRect();
              const hit = r.width > 0 && r.height > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
              out[id] = { hidden: el.hidden || r.width === 0, inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight, reachable: Boolean(hit && (hit === el || el.contains(hit))) }; }
            const isOpen = (id) => { const b = document.getElementById(id); return b ? b.getAttribute('aria-expanded') === 'true' : null; };
            const railOpen = isOpen('open-navigation'); const inspectorOpen = isOpen('open-inspector');
            // An open drawer (inspector below 1200 px, rail below 800 px) is a modal overlay: its backdrop covers the composer by design, so the drawer's own close control is what must be reachable.
            const drawerOpen = (inspectorOpen === true && window.innerWidth < 1200) || (railOpen === true && window.innerWidth < 800);
            const closeId = inspectorOpen === true && window.innerWidth < 1200 ? 'close-inspector' : 'close-navigation';
            if (drawerOpen) { const el = document.getElementById(closeId); if (!el) out.drawer_close = null; else { const r = el.getBoundingClientRect();
              const hit = r.width > 0 && r.height > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
              out.drawer_close = { id: closeId, hidden: el.hidden || r.width === 0, inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight, reachable: Boolean(hit && (hit === el || el.contains(hit))) }; } }
            return { innerWidth: window.innerWidth, innerHeight: window.innerHeight, rail_open_actual: railOpen, inspector_open_actual: inspectorOpen, drawer_open: drawerOpen, controls: out };
          })()`);
          rows.push({ zoom, rail_closed: rail, inspector_open: inspector, pane_state_ok: probe.rail_open_actual === !rail && probe.inspector_open_actual === inspector, ...probe });
        }
      }
    }
    win.setContentSize(1366, 600);
    win.webContents.setZoomFactor(1);
    await sleep(600);
    const shorter = await exec(`(() => { const el = document.getElementById('run-task'); const r = el.getBoundingClientRect();
      const b = document.querySelector('section.continuation-card button'); if (b) b.scrollIntoView({ block: 'nearest' });
      const br = b ? b.getBoundingClientRect() : null; const hit = br && br.width > 0 && br.height > 0 ? document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2) : null;
      return { innerHeight: window.innerHeight, inViewport: r.bottom <= window.innerHeight && r.top >= 0,
        card_button: br ? { inViewport: br.left >= 0 && br.top >= 0 && br.right <= window.innerWidth && br.bottom <= window.innerHeight, reachable: Boolean(hit && (hit === b || b.contains(hit))), disabled: Boolean(b.disabled) } : null }; })()`);
    win.setContentSize(1366, 768);
    await screenshot('ui02-layouts.png');
    const verdict = evaluateUiLayouts(rows, shorter, cardFacts);
    out('ui02-layouts.json', { rows, shorter, card: cardFacts, zoom_note: 'zoomFactor 1 and 1.25 (page zoom); this is not Windows DPI scaling', below_800: 'NOT_VERIFIED', bad: verdict.bad, card_bad: verdict.card_bad, verdict });
    record('B2-UI-02-LAYOUTS-DPI', 1, verdict.status, `layouts=${rows.length}; unusable=${verdict.bad}; card_found=${cardFacts.card_found}; card_unusable_or_disabled=${verdict.card_bad}; shorter_window_run_in_viewport=${shorter.inViewport}; shorter_window_card_usable=${verdict.shorter_card_ok}; page_zoom_only_not_windows_dpi=true; below_800=NOT_VERIFIED`);
  }

  async function continueSchema() {
    await bootstrap();
    await waitIdle(20000, 'supplement schema idle');
    const databaseFacts = () => ({
      turns: supplementalRowsFacts(dbAll('SELECT * FROM a9_turns ORDER BY rowid LIMIT 1001')),
      tasks: supplementalRowsFacts(dbAll('SELECT * FROM a9_tasks ORDER BY rowid LIMIT 1001')),
      events: supplementalRowsFacts(dbAll('SELECT * FROM a9_events ORDER BY rowid LIMIT 1001')),
      managed: supplementalRowsFacts(dbAll('SELECT * FROM a9_managed_processes ORDER BY rowid LIMIT 1001')),
      approvals: supplementalRowsFacts(dbAll('SELECT * FROM a9_approvals ORDER BY rowid LIMIT 1001')),
    });
    const before = { database: databaseFacts(), provider: await counters(), workspace: supplementalWorkspaceFacts(workspaceRoot) };
    const api = await exec(`({ keys: Object.keys(window.win7Agent.a9).sort(), requireType: typeof window.require, processType: typeof window.process })`);
    const ipcStart = ipcLog.length;
    const observations = [];
    for (const item of continuationSchemaCases()) {
      const response = await exec(`window.win7Agent.a9.continueTask(...${JSON.stringify(item.args)})`);
      observations.push({ ...item, ok: response && response.ok, code: response && response.error && response.error.code });
    }
    const after = { database: databaseFacts(), provider: await counters(), workspace: supplementalWorkspaceFacts(workspaceRoot) };
    const requests = ipcLog.slice(ipcStart).filter((item) => item.action === 'a9.task.continue');
    const rejected = evaluateContinuationSchema(observations, requests);
    const countsUnchanged = JSON.stringify(before.database) === JSON.stringify(after.database)
      && JSON.stringify(before.provider) === JSON.stringify(after.provider);
    const workspaceUnchanged = JSON.stringify(before.workspace) === JSON.stringify(after.workspace);
    const isolatedApi = api.requireType === 'undefined' && api.processType === 'undefined'
      && !api.keys.some((key) => /^(invoke|send|ipcRenderer|execute|exec|spawn|rawIpc)$/i.test(key));
    out('a2-m4-schema.json', { evidence_level: 'CURRENT_PACKAGE_PUBLIC_PRELOAD_IPC', observations, requests, before, after, api,
      unreachable_inputs: ['schemaVersion override', 'action override', 'additional payload fields'],
      scope: 'No arbitrary raw IPC; file side-effect comparison covers only the isolated workspace.' });
    record('A2-M4-CONTINUE-SCHEMA', 1, rejected ? 'PASS' : 'FAIL', `rejected=${observations.filter((item) => item.code === 'A9_PAYLOAD_INVALID').length}/17; ipc=${requests.length}`);
    record('A2-M4-CONTINUE-SCHEMA', 2, countsUnchanged && workspaceUnchanged ? 'PASS' : 'FAIL', `database_provider_unchanged=${countsUnchanged}; isolated_workspace_unchanged=${workspaceUnchanged}`);
    record('A2-M4-CONTINUE-SCHEMA', 3, isolatedApi ? 'PASS' : 'FAIL', 'public API inspected; schema/action overrides are not constructible');
  }

  // A9-36 candidate-external supplements. All product operations use the real public preload/IPC.
  // One driver launch runs one Stage of the orchestrator's closed plan (`STAGE_PLAN`); a Stage reports exactly its own assertion ids.
  const supplementModule = () => {
    if (!env.A9_ALPHA2_INPUT_MODULE || env.A9_ALPHA2_SUPPLEMENT_MODE !== MODE) throw new Error('A9_36_SUPPLEMENT_INPUT_REQUIRED');
    return require(env.A9_ALPHA2_INPUT_MODULE);
  };
  const localFile = (name) => path.join(workspaceRoot, name);
  const textFile = (name) => fs.existsSync(localFile(name)) ? fs.readFileSync(localFile(name), 'utf8') : null;
  const fileSha = (name) => fs.existsSync(localFile(name)) ? sha256(fs.readFileSync(localFile(name))) : null;
  const supplementAssert = (group, n, ok, facts) => { out(`a2-${group}-${n}.json`, facts); record(`A2-${group.toUpperCase()}`, n, ok === true ? 'PASS' : 'FAIL', JSON.stringify(facts).slice(0, 1600)); };
  // The fixture reads the workspace AGENTS.md at request time (to bind requests to input hashes), so it must know the workspace.
  const supplementBootstrap = async () => { const snap = await bootstrap(); await setFixture({ workspace: workspaceRoot }); return snap; };
  async function supplementTurn(prompt, timeout = 180000) {
    const proof = await runPrompt(prompt, timeout); const ended = proof.events.filter((e) => isTerminalEvent(e)).slice(-1)[0];
    if (!ended) throw new Error('A9_36_TERMINAL_MISSING');
    await waitIdle(30000, 'supplement terminal idle');
    return { turnId: ended.turnId, ended, data: eventData(ended), events: proof.events.filter((e) => e.turnId === ended.turnId), dom: proof.dom };
  }
  const approvalReply = (p, decision, overrides = {}) => exec(`window.win7Agent.a9.resumeApproval(${JSON.stringify(p.approvalId)},${JSON.stringify(decision)},${JSON.stringify(overrides.digest || p.bindingDigest)},${JSON.stringify(overrides.conversation || p.conversationId)},${JSON.stringify(p.taskId)},${JSON.stringify(p.turnId)})`);
  const turnCount = (conv) => dbAll('SELECT count(*) AS n FROM a9_turns WHERE session_id = ?', conv)[0].n;
  const toolStartCount = (conv) => dbAll("SELECT count(*) AS n FROM a9_events WHERE session_id = ? AND event_type = 'tool_start'", conv)[0].n;
  const reviewCounts = (conv) => ({ turns: turnCount(conv), tool_starts: toolStartCount(conv), approvals: dbAll('SELECT count(*) AS n FROM a9_approvals')[0].n,
    checkpoints: dbAll('SELECT count(*) AS n FROM a9_checkpoints')[0].n, managed: dbAll('SELECT count(*) AS n FROM a9_managed_processes')[0].n });
  const eventRows = (conv, type) => dbAll('SELECT count(*) AS n FROM a9_events WHERE session_id = ? AND event_type = ?', conv, type)[0].n;
  const shellEnds = (evts) => evts.filter((e) => e.eventType === 'tool_end' && eventData(e).toolName === 'shell')
    .map((e) => ({ exit_code: eventData(e).shell ? eventData(e).shell.exitCode : undefined, stdout: (eventData(e).shell && eventData(e).shell.stdout) || '', event_id: e.eventId }));
  // Local Git facts come from the Git binary the orchestrator pinned, never through the product.
  const gitCli = (args, cwd) => {
    const r = childProcess.spawnSync(env.A9_ALPHA2_GIT, args, { cwd: cwd || workspaceRoot, encoding: 'utf8', timeout: 20000, windowsHide: true });
    return { status: r.status, stdout: String(r.stdout || '').replace(/\s+$/, ''), stderr: String(r.stderr || '').trim().slice(0, 300) };
  };
  const originRefs = () => { const r = gitCli(['--git-dir', env.A9_ALPHA2_ORIGIN, 'for-each-ref', '--format=%(refname) %(objectname)']); return r.status === 0 ? r.stdout : null; };
  // Files of the workspace with their hashes; the recovery store and the repository metadata are not workspace content.
  function workspaceTree() {
    const rows = [];
    const visit = (directory) => {
      for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (item.name === '.agent_recovery' || item.name === '.git') continue;
        const absolute = path.join(directory, item.name);
        if (item.isDirectory()) visit(absolute);
        else if (item.isFile()) rows.push({ path: path.relative(workspaceRoot, absolute).split(path.sep).join('/'), sha256: sha256(fs.readFileSync(absolute)) });
      }
    };
    visit(workspaceRoot);
    return rows;
  }
  // An interrupted task written the way the A9-32 lifecycle tests write one; the card appears after the page reloads and shows the conversation again.
  async function injectInterrupted(conv, taskId, oldTurn, goal) {
    const db = openDb(false);
    try { insertInterruptedTask(db, conv, taskId, oldTurn, goal); } finally { db.close(); }
    const recovery = await waitFor(() => findRecovery(taskId), 20000, 'injected recovery fact');
    await reloadRenderer(); await activateConversation(conv);
    await waitFor(async () => (await domState()).cards > 0, 30000, 'continue card');
    return recovery;
  }
  // One real click on the card's button: waits for the card to be enabled, the continue event, and the end of the Turn.
  async function clickAndSettle(conv, taskId, label) {
    const before = (await continueEventsFor(conv, taskId)).length;
    await waitFor(async () => { const c = await cardInfo(); return c && c.disabled === false ? c : null; }, 30000, 'enabled continue card ' + label);
    if ((await clickContinue()) !== 'clicked') throw new Error('A9_36_CONTINUE_NOT_CLICKED');
    await waitFor(async () => (await continueEventsFor(conv, taskId)).length >= before + 1, 30000, 'continue event ' + label);
    await waitIdle(120000, 'continue settled ' + label);
    return continueEventsFor(conv, taskId);
  }
  const continueState = async (conv, taskId) => ({ requests: (await counters()).requests, tool_starts: toolStartCount(conv), turns: turnCount(conv), continue_events: (await continueEventsFor(conv, taskId)).length });

  async function deniedGit(prompt, command) {
    await waitIdle(30000, 'git denial idle'); const baseline = await eventBaseline(); await submit(prompt);
    const pending = await waitFor(async () => (await snapshot()).pendingApproval || null, 30000, 'git approval');
    const bound = pending.args && pending.args.command === command && pending.gitBinding && pending.gitBinding.commandSha256 === sha256(command);
    const card = await exec(`({ visible: !document.getElementById('a9-approval-card').hidden, digest: document.getElementById('a9-approval-card').dataset.bindingDigest })`);
    const denied = await approvalReply(pending, 'denied');
    await observeUntil(async (evts) => Boolean(targetTurnEnd(evts, baseline, pending.turnId)), 30000, 'denied terminal');
    await waitIdle(30000, 'denied idle');
    const audit = (await events(pending.conversationId, 1000)).events.filter((e) => e.turnId === pending.turnId);
    const row = dbAll('SELECT approval_id, session_id, turn_id, decision FROM a9_approvals WHERE approval_id = ?', pending.approvalId)[0];
    return { command_sha256: sha256(command), bound: Boolean(bound), remote: pending.gitBinding && pending.gitBinding.remote !== undefined ? pending.gitBinding.remote : null,
      branch: pending.gitBinding && pending.gitBinding.branch !== undefined ? pending.gitBinding.branch : null, visible_bound_card: card.visible && card.digest === pending.bindingDigest,
      denied_ok: denied && denied.ok, approval_decision: row ? row.decision : null,
      no_execution: !audit.some((e) => e.eventType === 'tool_start'), row_bound: Boolean(row && row.session_id === pending.conversationId && row.turn_id === pending.turnId) };
  }
  const LOCAL_COMMIT = 'git -c user.name=A2 -c user.email=a2@example.invalid commit -m A2-local';
  async function localCommitTurn(prompt, expected = LOCAL_COMMIT) {
    await waitIdle(30000, 'local commit idle'); const baseline = await eventBaseline(); await submit(prompt);
    const pending = await waitFor(async () => (await snapshot()).pendingApproval || null, 30000, 'explicit local commit approval');
    if (pending.toolName !== 'shell' || pending.args?.command !== expected || pending.gitBinding?.commandSha256 !== sha256(expected)) throw new Error('A9_36_LOCAL_COMMIT_BINDING');
    const accepted = await approvalReply(pending, 'approved'); if (!accepted.ok) throw new Error('A9_36_LOCAL_COMMIT_REFUSED');
    const proof = await observeUntil(async (evts) => Boolean(targetTurnEnd(evts, baseline, pending.turnId)), 60000, 'local commit terminal');
    await waitIdle(30000, 'local commit settled'); const terminal = targetTurnEnd(proof.events, baseline, pending.turnId);
    return { turnId: pending.turnId, data: eventData(terminal), events: proof.events.filter((e) => e.turnId === pending.turnId), approval: { command_sha256: sha256(expected), accepted: accepted.ok } };
  }
  // M1-07 [C]: the candidate's own Policy engine, Full Access, evaluation only; nothing is dispatched.
  function f01Rows(module) {
    const dist = path.join(candidateRoot, 'resources', 'app', 'core', 'dist');
    const types = require(path.join(dist, 'types.js')); const { PolicyEngine } = require(path.join(dist, 'policy.js'));
    const engine = new PolicyEngine(); const rows = [];
    for (const [group, list] of [['wrapped', module.F01_WRAPPED], ['data', module.F01_DATA], ['control', module.F01_CONTROLS]]) {
      for (const command of list) {
        const decision = engine.evaluate({ id: 'a2-f01', toolName: 'shell', args: { command }, approvalLevel: types.ApprovalLevel.FULL_ACCESS });
        rows.push({ group, command, verdict: decision.verdict, rule_id: decision.ruleId });
      }
    }
    return rows;
  }
  // M1-06: the approval card of the long command at 1366x768, measured in the page and photographed, then denied.
  async function longCardTurn(module) {
    await waitIdle(30000, 'long card idle'); win.setContentSize(1366, 768); await sleep(600);
    const baseline = await eventBaseline(); await submit('a2-long-card:请执行长命令');
    const pending = await waitFor(async () => (await snapshot()).pendingApproval || null, 30000, 'long card approval');
    await sleep(500);
    const page = await exec(`(() => {
      const card = document.getElementById('a9-approval-card'); const summary = document.getElementById('a9-approval-summary');
      const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const style = getComputedStyle(summary);
      const hidden = (value) => value === 'hidden' || value === 'clip';
      const clipped = (hidden(style.overflowY) && summary.scrollHeight > summary.clientHeight + 1) || (hidden(style.overflowX) && summary.scrollWidth > summary.clientWidth + 1)
        || (style.textOverflow === 'ellipsis' && summary.scrollWidth > summary.clientWidth + 1);
      const buttons = Array.from(card.querySelectorAll('button')).filter((b) => !b.hidden && b.offsetParent !== null).map(rect);
      return { dom_summary: summary.textContent, card_rect: rect(card), summary_rect: rect(summary), buttons, clipped, font_px: parseFloat(style.fontSize),
        overflow: [style.overflowX, style.overflowY], white_space: style.whiteSpace, scroll: [summary.scrollWidth, summary.scrollHeight, summary.clientWidth, summary.clientHeight],
        viewport: { width: window.innerWidth, height: window.innerHeight }, card_hidden: card.hidden };
    })()`);
    await screenshot('a2-m1-long-card.png');
    const denied = await approvalReply(pending, 'denied');
    await observeUntil(async (evts) => Boolean(targetTurnEnd(evts, baseline, pending.turnId)), 30000, 'long card denied terminal');
    await waitIdle(30000, 'long card denied idle');
    const audit = (await events(pending.conversationId, 1000)).events.filter((e) => e.turnId === pending.turnId);
    const shown = /shell cwd=(.*?): /s.exec(String(pending.summary || ''));
    const cwdResolves = Boolean(shown) && path.resolve(workspaceRoot, shown[1]).toLowerCase() === path.resolve(workspaceRoot).toLowerCase();
    return { command: module.LONG_CARD_COMMAND, command_chars: module.LONG_CARD_COMMAND.length, summary: pending.summary, summary_chars: String(pending.summary || '').length, cwd_shown: shown ? shown[1] : null,
      cwd_shown_resolves: cwdResolves, dom_summary: page.dom_summary, card_rect: page.card_rect, summary_rect: page.summary_rect, buttons: page.buttons, clipped: page.clipped, font_px: page.font_px,
      viewport: page.viewport, overflow: page.overflow, white_space: page.white_space, scroll: page.scroll,
      bound: pending.toolName === 'shell' && Boolean(pending.args) && pending.args.command === module.LONG_CARD_COMMAND && /^[a-f0-9]{64}$/.test(String(pending.bindingDigest || '')),
      denied_ok: Boolean(denied && denied.ok), tool_starts_after: audit.filter((e) => e.eventType === 'tool_start').length };
  }

  async function supplementPolicyGit() {
    await supplementBootstrap(); const module = supplementModule(); const forms = [];
    const refsBefore = originRefs(); const localBefore = { main: gitCli(['rev-parse', 'refs/heads/main']).stdout, unpushed: gitCli(['rev-list', '--count', 'refs/remotes/origin/main..refs/heads/main']).stdout };
    for (let n = 0; n < module.GIT_FORMS.length; n++) forms.push(await deniedGit(`a2-git:${n}`, module.GIT_FORMS[n]));
    const refsAfter = originRefs(); const localAfter = { main: gitCli(['rev-parse', 'refs/heads/main']).stdout, unpushed: gitCli(['rev-list', '--count', 'refs/remotes/origin/main..refs/heads/main']).stdout };
    const denials = evaluateGitDenials({ forms, origin_main: env.A9_ALPHA2_ORIGIN_MAIN, refs_before: refsBefore, refs_after: refsAfter, local_main_before: localBefore.main, local_main_after: localAfter.main,
      unpushed_before: localBefore.unpushed, unpushed_after: localAfter.unpushed });
    supplementAssert('m1-policy-git', 1, denials.ok, { forms, entry_alternation: 'shell/start_process', origin: { main_before_forms: env.A9_ALPHA2_ORIGIN_MAIN, refs_before: refsBefore, refs_after: refsAfter },
      local: { before: localBefore, after: localAfter }, verdict: denials });
    await exec('window.win7Agent.a9.setMode("read_only")');
    await waitFor(async () => (await snapshot()).mode === 'read_only', 10000, 'read only');
    const ro = [];
    for (const name of ['write', 'shell', 'start_process']) ro.push(await supplementTurn('a2-readonly:' + name));
    const absent = ['readonly.txt', 'readonly-shell.txt', 'readonly-start.txt'].every((n) => !fs.existsSync(localFile(n)));
    const readOnly = supplementalReadOnlyFacts(ro, providerLines(), absent);
    supplementAssert('m1-policy-git', 2, readOnly.ok, { ...readOnly, terminals: ro.map((r) => r.data) });
    await ensureMode();
    fs.writeFileSync(localFile('probe.txt'), 'modified before approved reset\n', 'utf8');
    const baseline = await eventBaseline(); await submit('a2-approve');
    const pending = await waitFor(async () => (await snapshot()).pendingApproval || null, 30000, 'reset approval');
    const before = await counters(); const wrongDigest = await approvalReply(pending, 'approved', { digest: '0'.repeat(64) });
    const wrongTarget = await approvalReply(pending, 'approved', { conversation: 'wrong-conversation' });
    const afterWrong = await counters(); const stillPending = (await snapshot()).pendingApproval;
    const unchanged = textFile('probe.txt') === 'modified before approved reset\n';
    supplementAssert('m1-policy-git', 3, wrongDigest.ok === false && wrongTarget.ok === false && unchanged && before.requests === afterWrong.requests
      && stillPending && stillPending.approvalId === pending.approvalId, { wrongDigest, wrongTarget, unchanged, requests_before: before.requests, requests_after: afterWrong.requests });
    const approved = await approvalReply(pending, 'approved');
    const reset = await observeUntil(async (evts) => Boolean(targetTurnEnd(evts, baseline, pending.turnId)), 30000, 'approved reset');
    await waitIdle(30000, 'reset idle');
    const resetAudit = reset.events.filter((e) => e.turnId === pending.turnId);
    supplementAssert('m1-policy-git', 4, approved.ok === true && textFile('probe.txt') === 'value 0\n'
      && resetAudit.some((e) => e.eventType === 'tool_end' && eventData(e).shell?.exitCode === 0), { approved, restored: textFile('probe.txt'), events: resetAudit });
    fs.writeFileSync(localFile('probe.txt'), 'local commit content\n', 'utf8');
    const local = await localCommitTurn('a2-git-local:请创建本地Git提交，只提交probe.txt');
    const result = gitCli(['log', '-1', '--format=%s']);
    const ends = local.events.filter((e) => e.eventType === 'tool_end' && eventData(e).toolName === 'shell');
    supplementAssert('m1-policy-git', 5, result.status === 0 && result.stdout.trim() === 'A2-local' && ends.length === 4 && ends.every((e) => eventData(e).shell?.exitCode === 0), { last_commit: result.stdout.trim(), terminal: local.data, shell_ends: ends });
    // Explicit CMD uses the product shell selector; this is separate from automatic fallback in an absent-PS environment.
    const shellBefore = (await snapshot()).shell;
    const cmdResult = await exec('window.win7Agent.a9.configureShell({kind:"cmd",envOverlay:{}})');
    const cmdShell = (await snapshot()).shell; const cmdConfigured = cmdResult.ok === true && cmdShell.kind === 'cmd'; let cmdTurn = null;
    // A failed configuration is recorded and stops the Stage here: the commands below would run in the previous Shell and prove nothing about CMD.
    if (cmdConfigured) {
      fs.writeFileSync(localFile('probe.txt'), 'local CMD commit content\n', 'utf8');
      cmdTurn = await localCommitTurn('a2-git-local:请创建本地Git提交，只提交probe.txt');
    }
    supplementAssert('m1-policy-git', 6, cmdConfigured && cmdTurn.events.some((e) => e.eventType === 'tool_end' && eventData(e).shell?.exitCode === 0),
      { previous_shell: shellBefore, cmd_result: cmdResult, cmd_shell: cmdShell, cmd_executable: cmdExecutable, terminal: cmdTurn ? cmdTurn.data : null, automatic_fallback: 'NOT_PERFORMED_HOST_POWERSHELL_PRESENT', fresh_local_commit: cmdConfigured });
    if (!cmdConfigured) throw new Error('A9_36_CMD_NOT_CONFIGURED');
    // M1-04: local branch listing, local branch switch, add and an approved local commit; the repository, index, files and processes are read before and after.
    fs.writeFileSync(localFile('probe.txt'), 'topic branch content\n', 'utf8');
    const branchBefore = gitCli(['branch', '--show-current']).stdout; const mainBefore = gitCli(['rev-parse', 'refs/heads/main']).stdout;
    const statusBefore = gitCli(['status', '--porcelain']).stdout; const indexBefore = gitCli(['ls-files', '-s']).stdout; const treeBefore = myTree();
    const topicCommit = 'git -c user.name=A2 -c user.email=a2@example.invalid commit -m A2-topic';
    const topic = await localCommitTurn('a2-git-branch:请在本地分支提交probe.txt', topicCommit);
    await sleep(1500);
    const topicFacts = { shell_ends: shellEnds(topic.events), branch_before: branchBefore, branch_after: gitCli(['branch', '--show-current']).stdout, head_subject: gitCli(['log', '-1', '--format=%s']).stdout,
      main_before: mainBefore, main_after: gitCli(['rev-parse', 'refs/heads/main']).stdout, origin_main: env.A9_ALPHA2_ORIGIN_MAIN, origin_refs_after: originRefs(),
      status_before: statusBefore, status_after: gitCli(['status', '--porcelain']).stdout, index_before: indexBefore, index_after: gitCli(['ls-files', '-s']).stdout,
      head_files: gitCli(['ls-tree', '-r', '--name-only', 'HEAD']).stdout.split('\n').filter(Boolean), head_blob: gitCli(['rev-parse', 'HEAD:probe.txt']).stdout,
      worktree_blob: gitCli(['hash-object', 'probe.txt']).stdout, approval: topic.approval, new_processes: newProcesses(treeBefore, myTree()) };
    const topicVerdict = evaluateLocalBranch(topicFacts);
    supplementAssert('m1-policy-git', 7, topicVerdict.ok, { ...topicFacts, terminal: topic.data, verdict: topicVerdict });
    // M1-05: a test-class command that ends, with its v3 stream frames; the shell is the explicitly selected CMD.
    // check.py exits 0 only when probe.txt starts with 'value '; the branch step above left other content, so the test input is set explicitly.
    fs.writeFileSync(localFile('probe.txt'), 'value test\n', 'utf8');
    const testTurn = await supplementTurn('a2-cmd-test:请运行测试');
    const testFrames = framesFromEvents(testTurn.events); const testVerdict = evaluateTestStream({ frames: testFrames, order: evaluateStreamOrder(testFrames), ends: shellEnds(testTurn.events),
      turn_id: testTurn.turnId, shell_kind: (await snapshot()).shell.kind, outcome: testTurn.data.outcome });
    supplementAssert('m1-policy-git', 8, testVerdict.ok, { frames: testFrames.length, frame_texts: testFrames.map((fr) => fr.text).slice(0, 8), order: evaluateStreamOrder(testFrames), ends: shellEnds(testTurn.events), terminal: testTurn.data, verdict: testVerdict });
    // M1-05: a build-class command cancelled while it streams.
    const buildTree = myTree(); const buildBaseline = await eventBaseline(); await waitIdle(30000, 'build idle'); await submit('a2-cmd-build:请运行构建');
    const ticksNeeded = 2; const streaming = await observeUntil(async (evts) => framesFromEvents(evts).filter((fr) => fr.text.includes('A2-BUILD-TICK')).length >= ticksNeeded, 120000, 'build ticks');
    const framesBeforeCancel = framesFromEvents(streaming.events).filter((fr) => fr.eventId > buildBaseline);
    await exec('document.getElementById("cancel-task").click(); true');
    await waitIdle(60000, 'build cancelled'); await sleep(3000);
    const buildConv = await conversationId(); const afterSettle = (await events(buildConv, 1000)).events.filter((e) => e.eventId > buildBaseline);
    await sleep(3000);
    const afterWait = (await events(buildConv, 1000)).events.filter((e) => e.eventId > buildBaseline);
    const buildTerminal = afterWait.filter(isTerminalEvent).slice(-1)[0];
    const wmicBefore = wmicFailures; const buildNew = newProcesses(buildTree, myTree());
    const buildFrames = framesFromEvents(afterWait);
    const buildVerdict = evaluateBuildCancel({ start_seen: framesBeforeCancel.some((fr) => fr.text.includes('A2-BUILD-START')), ticks_before_cancel: framesBeforeCancel.filter((fr) => fr.text.includes('A2-BUILD-TICK')).length,
      order: evaluateStreamOrder(buildFrames), terminal_outcome: buildTerminal ? eventData(buildTerminal).outcome : null, frames_after_settle: framesFromEvents(afterSettle).length, frames_after_wait: buildFrames.length,
      new_processes: buildNew, process_probe_failures: wmicFailures - wmicBefore });
    supplementAssert('m1-policy-git', 9, buildVerdict.ok, { frames_before_cancel: framesBeforeCancel.length, frames_total: buildFrames.length, terminal: buildTerminal ? eventData(buildTerminal) : null, new_processes: buildNew,
      shell_ends: shellEnds(afterWait), verdict: buildVerdict });
    // M1-06: the long command card at 1366x768.
    const card = await longCardTurn(module); const cardVerdict = evaluateLongCard(card);
    supplementAssert('m1-policy-git', 10, cardVerdict.ok, { ...card, verdict: cardVerdict });
    // M1-07 [C]: F-01 characterisation by the package Policy engine; no tool dispatched.
    const startsBefore = dbAll("SELECT count(*) AS n FROM a9_events WHERE event_type = 'tool_start'")[0].n;
    const rows = f01Rows(module);
    const startsAfter = dbAll("SELECT count(*) AS n FROM a9_events WHERE event_type = 'tool_start'")[0].n;
    const f01 = evaluateF01(rows, { wrapped: module.F01_WRAPPED, data: module.F01_DATA, controls: module.F01_CONTROLS, tool_starts_before: startsBefore, tool_starts_after: startsAfter });
    supplementAssert('m1-policy-git', 11, f01.ok, { level: 'COMPONENT_PACKAGE_POLICY_ENGINE', mode: 'full_access', rows, tool_starts: { before: startsBefore, after: startsAfter }, verdict: f01,
      meaning: 'behaviour matches known limitation F-01 (ADR-0239); it does not show that wrappers ask for confirmation', unknown_modes: ['review', 'workspace_write'] });
  }
  async function supplementVerification() {
    await supplementBootstrap(); const verification = [];
    for (let n = 1; n <= 5; n++) {
      fs.writeFileSync(localFile('probe.txt'), `value ${n - 1}\n`, 'utf8');
      const turn = await supplementTurn(`a2-verify:${n}`);
      verification.push({ round: n, ...turn });
    }
    await waitFor(() => fs.existsSync(localFile('background-effect.txt')) ? true : null, 30000, 'verification background effect');
    await stopAllManaged();
    const largeFailure = verification[3].events.some((e) => e.eventType === 'tool_end' && eventData(e).shell?.exitCode === 1 && (eventData(e).shell?.stdout || '').length >= 20000);
    const expected = ['unverified', 'verified', 'unverified', 'unverified', 'unverified'];
    supplementAssert('m2-verification', 1, largeFailure && verification.every((t, n) => t.data.verification === expected[n]), { largeFailure, expected, observed: verification.map((t) => t.data),
      checks: verification.map((t) => ({ turnId: t.turnId, verification_events: t.events.filter((e) => ['verification_result', 'tool_end'].includes(e.eventType)) })) });
    const provider = [];
    for (const reason of ['tool_calls', 'missing', 'length', 'content_filter', 'stop', 'empty', 'invalid_json']) {
      await newConversation(); if (fs.existsSync(localFile('provider-effect.txt'))) fs.unlinkSync(localFile('provider-effect.txt'));
      const turn = await supplementTurn('a2-provider:' + reason);
      provider.push({ reason, terminal: turn.data, written: textFile('provider-effect.txt'), starts: turn.events.filter((e) => e.eventType === 'tool_start').length });
    }
    supplementAssert('m2-verification', 2, provider[0].written === 'tool_calls' && provider[0].starts === 1
      && provider.slice(1).every((p) => p.written === null && p.starts === 0 && p.terminal.outcome === 'failed'), { provider });
    const rules = []; const agentsSha = sha256(textFile('AGENTS.md'));
    for (let n = 0; n < 2; n++) { await newConversation(); const turn = await supplementTurn('a2-rules'); rules.push({ turnId: turn.turnId, started: turn.events.find((e) => e.eventType === 'turn_started') }); }
    const requests = providerLines().filter((r) => r.prompt === 'a2-rules' && !r.probe);
    supplementAssert('m2-verification', 3, requests.length === 2 && requests.every((r) => r.rules === 1 && r.environment === 1), { requests, rules });
    const before = await counters(); const retry = await supplementTurn('a2-context-retry'); const after = await counters();
    supplementAssert('m2-verification', 4, after.requests - before.requests === 2 && ['completed', 'completed_with_warnings'].includes(retry.data.outcome), { requests: after.requests - before.requests, terminal: retry.data, irreducible_budget: 'DEFERRED_NOT_RUN' });
    fs.writeFileSync(localFile('probe.txt'), 'value 0\n', 'utf8');
    const db = openDb(false);
    try { db.exec("CREATE TRIGGER a2_tool_start_failure BEFORE INSERT ON a9_events WHEN NEW.event_type='tool_start' AND json_extract(NEW.payload_json,'$.data.toolName')='edit' BEGIN SELECT RAISE(FAIL,'a2 injected tool_start failure'); END"); }
    finally { db.close(); }
    const auditBefore = await counters();
    const response = await exec('window.win7Agent.a9.submitTurn("a2-audit-start")');
    await waitIdle(30000, 'tool start audit failure');
    const second = await exec('window.win7Agent.a9.submitTurn("a2-rules")'); const auditAfter = await counters();
    const currentEvents = (await events(await conversationId(), 1000)).events;
    supplementAssert('m2-verification', 5, textFile('probe.txt') === 'value 0\n' && !fs.existsSync(localFile('never.txt'))
      && second.ok === false && auditAfter.requests - auditBefore.requests === 2, { response, second, requests: auditAfter.requests - auditBefore.requests,
        content: textFile('probe.txt'), never_exists: fs.existsSync(localFile('never.txt')), audit_tail: currentEvents.slice(-15) });
    // M2-04: the request is bound to the AGENTS.md that was on disk and to one system prompt body, by hash.
    const inputs = evaluateInputShas({ agents_sha256: agentsSha, requests });
    supplementAssert('m2-verification', 6, inputs.ok, { agents_sha256: agentsSha, requests: requests.map((r) => ({ request: r.request, agents_sha256: r.agents_sha256, agents_in_request: r.agents_in_request, system_sha256: r.system_sha256, rules: r.rules, environment: r.environment })), verdict: inputs });
  }
  // M2-03: one required audit write fails in its own product start (the block lasts until the product restarts). `spec.failing` is the event type whose write is refused.
  async function auditStage(spec) {
    await supplementBootstrap(); await newConversation(); const conv = await conversationId();
    const db = openDb(false);
    try { db.exec(spec.trigger_sql); } finally { db.close(); }
    const installed = dbAll("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?", spec.trigger_name).length === 1;
    const before = await counters(); const lineStart = providerLines().length;
    const response = await exec(`window.win7Agent.a9.submitTurn(${JSON.stringify(spec.prompt)})`);
    await waitIdle(60000, spec.trigger_name + ' turn ended');
    const afterTurn = await counters();
    const second = await exec('window.win7Agent.a9.submitTurn("a2-rules")'); const afterSubmit = await counters();
    const lines = providerLines().slice(lineStart).filter((r) => !r.probe && r.prompt === spec.prompt);
    const all = (await events(conv, 1000)).events;
    const facts = { prompt: spec.prompt, failing: spec.failing, trigger_installed: installed, response_ok: response && response.ok, response_code: response && response.error ? response.error.code : null,
      failing_event_rows: eventRows(conv, spec.failing), turn_completed: all.some((e) => e.eventType === 'turn_completed'), never_exists: spec.never_file ? fs.existsSync(localFile(spec.never_file)) : false,
      tool_result_requests: lines.filter((r) => r.tool_messages >= 1).length, max_tool_result_requests: spec.max_tool_result_requests || 0, tool_starts: toolStartCount(conv), provider_lines: lines.map((r) => ({ request: r.request, tool_messages: r.tool_messages, issued_tool: r.issued_tool })),
      second_submit_ok: second && second.ok, second_submit_code: second && second.error ? second.error.code : null,
      requests: { before: before.requests, after_turn: afterTurn.requests, after_submit: afterSubmit.requests }, require_continue: spec.with_continue === true };
    if (spec.with_continue) {
      const taskId = 'a2-audit-task';
      const dbTask = openDb(false);
      try { insertInterruptedTask(dbTask, conv, taskId, 'a2-audit-old-turn', 'a2-rules'); } finally { dbTask.close(); }
      const recovery = await waitFor(() => findRecovery(taskId), 20000, 'audit recovery fact');
      const attempt = async (revision) => {
        const s0 = await continueState(conv, taskId);
        const result = await exec(`window.win7Agent.a9.continueTask(${JSON.stringify(conv)}, ${JSON.stringify(taskId)}, ${JSON.stringify(recovery.interruptedTurnId)}, ${JSON.stringify(revision)})`);
        const s1 = await continueState(conv, taskId);
        return { ok: result && result.ok, code: result && result.error ? result.error.code : null, revision, requests_before: s0.requests, requests_after: s1.requests, continue_events_before: s0.continue_events,
          continue_events_after: s1.continue_events, turns_before: s0.turns, turns_after: s1.turns, tool_starts_before: s0.tool_starts, tool_starts_after: s1.tool_starts, blocked_reason_on_card: recovery.blockedReason || null };
      };
      facts.continue_attempts = [await attempt(recovery.recoveryRevision), await attempt('f'.repeat(64))];
    }
    const verdict = evaluateAuditStage(facts);
    // The injected trigger and any leftover background process are removed; the data root is disposable.
    try { const cleanup = openDb(false); try { cleanup.exec(`DROP TRIGGER IF EXISTS ${spec.trigger_name}`); } finally { cleanup.close(); } } catch (_error) { /* disposable data root */ }
    await sleep(spec.settle_ms || 0);
    try { await stopAllManaged(); } catch (error) { facts.stop_all_error = String(error && error.message ? error.message : error).slice(0, 200); }
    supplementAssert('m2-verification', spec.id, verdict.ok, { ...facts, verdict });
  }
  const supplementAuditOutput = () => auditStage({ id: 7, prompt: 'a2-audit-output', failing: 'tool_output', never_file: 'never-output.txt', with_continue: true, trigger_name: 'a2_tool_output_failure',
    trigger_sql: "CREATE TRIGGER a2_tool_output_failure BEFORE INSERT ON a9_events WHEN NEW.event_type='tool_output' AND json_extract(NEW.payload_json,'$.data.toolName')='shell' BEGIN SELECT RAISE(FAIL,'a2 injected tool_output failure'); END" });
  const supplementAuditManaged = () => auditStage({ id: 8, prompt: 'a2-audit-managed', failing: 'tool_output', never_file: null, max_tool_result_requests: 1, settle_ms: 4000, trigger_name: 'a2_managed_output_failure',
    trigger_sql: "CREATE TRIGGER a2_managed_output_failure BEFORE INSERT ON a9_events WHEN NEW.event_type='tool_output' AND json_extract(NEW.payload_json,'$.data.toolName')='start_process' BEGIN SELECT RAISE(FAIL,'a2 injected managed tool_output failure'); END" });
  const supplementAuditOwnership = () => auditStage({ id: 9, prompt: 'a2-audit-ownership', failing: 'managed_process_ownership', never_file: 'never-ownership.txt', settle_ms: 1000, trigger_name: 'a2_ownership_failure',
    trigger_sql: "CREATE TRIGGER a2_ownership_failure BEFORE INSERT ON a9_events WHEN NEW.event_type='managed_process_ownership' BEGIN SELECT RAISE(FAIL,'a2 injected ownership event failure'); END" });
  // M2-04 (continuation) and M2-06 (Provider failure): an interrupted task, a changed AGENTS.md, a failing Provider, one click; then the Provider recovers and one more click.
  async function supplementContinue() {
    await supplementBootstrap(); await newConversation(); const conv = await conversationId();
    const taskId = 'a2-cont-task'; const goal = 'a2-rules'; const newMarker = 'A2-RULE-MARKER-CHANGED';
    const agentsOld = textFile('AGENTS.md'); const agentsOldSha = sha256(agentsOld);
    await supplementTurn(goal);
    const baseline = providerLines().filter((r) => !r.probe && r.prompt === goal && r.continuation === false)[0] || null;
    const recovery0 = await injectInterrupted(conv, taskId, 'a2-cont-old-turn', goal);
    const agentsNew = `# ${newMarker}\nOnly change files in this isolated workspace.\nThe rule text changed after the interruption.\n`;
    fs.writeFileSync(localFile('AGENTS.md'), agentsNew, 'utf8'); const agentsNewSha = sha256(agentsNew);
    await setFixture({ providerFail: true });
    const s0 = await continueState(conv, taskId); const lineStart = providerLines().length;
    const events1 = await clickAndSettle(conv, taskId, 'provider failure');
    const s1 = await continueState(conv, taskId);
    const continuationLines = providerLines().slice(lineStart).filter((r) => !r.probe);
    const recovery1 = await waitFor(async () => { const r = await findRecovery(taskId); return r && r.interruptedTurnId !== recovery0.interruptedTurnId ? r : null; }, 30000, 'recovery after failed continuation');
    const reload = evaluateContinueReload({ baseline, continuation_lines: continuationLines, agents_old_sha256: agentsOldSha, agents_new_sha256: agentsNewSha, new_marker: newMarker, goal });
    supplementAssert('m2-verification', 10, reload.ok, { baseline: baseline && { agents_sha256: baseline.agents_sha256, system_sha256: baseline.system_sha256, rule_markers: baseline.rule_markers },
      continuation_lines: continuationLines.map((r) => ({ request: r.request, continuation: r.continuation, prompt: r.prompt, rules: r.rules, rule_markers: r.rule_markers, environment: r.environment, agents_sha256: r.agents_sha256, agents_in_request: r.agents_in_request, system_sha256: r.system_sha256, chars: r.chars })),
      agents_old_sha256: agentsOldSha, agents_new_sha256: agentsNewSha, budget_chars_in_snapshot: ((await snapshot()).contextWindow || {}).budgetChars, verdict: reload });
    const requestsAfterFailure = (await counters()).requests;
    await sleep(3000);
    const requestsAfterWait = (await counters()).requests;
    await setFixture({ providerFail: false });
    const s2 = await continueState(conv, taskId);
    const events2 = await clickAndSettle(conv, taskId, 'provider recovered');
    const s3 = await continueState(conv, taskId);
    const first = events1[0]; const secondEvent = events2[events2.length - 1];
    const dupBefore = await continueState(conv, taskId);
    const duplicate = await exec(`window.win7Agent.a9.continueTask(${JSON.stringify(conv)}, ${JSON.stringify(taskId)}, ${JSON.stringify(recovery0.interruptedTurnId)}, ${JSON.stringify(recovery0.recoveryRevision)})`);
    const dupAfter = await continueState(conv, taskId);
    const failure = evaluateProviderFailureContinue({ first: { requests_delta: s1.requests - s0.requests, continue_events: s1.continue_events - s0.continue_events, turn_id: first ? first.turnId : null },
      requests_after_failure: requestsAfterFailure, requests_after_wait: requestsAfterWait, recovery_before: recovery0, recovery_after_failure: recovery1,
      second: { requests_before: s2.requests, requests_after: s3.requests, continue_events: s3.continue_events, interrupted_turn_id: secondEvent ? eventData(secondEvent).interruptedTurnId : null, turn_status: secondEvent ? turnStatus(secondEvent.turnId) : null },
      duplicate: { ok: duplicate && duplicate.ok, duplicate: duplicate && duplicate.continuation ? duplicate.continuation.duplicate === true : null, turn_id: duplicate && duplicate.continuation ? duplicate.continuation.turnId : null,
        requests_before: dupBefore.requests, requests_after: dupAfter.requests, continue_events_before: dupBefore.continue_events, continue_events_after: dupAfter.continue_events } });
    supplementAssert('m2-verification', 11, failure.ok, { s0, s1, s2, s3, requests_after_failure: requestsAfterFailure, requests_after_wait: requestsAfterWait, recovery_before: recovery0, recovery_after_failure: recovery1,
      first_turn: first ? first.turnId : null, second_event: secondEvent ? { turnId: secondEvent.turnId, interrupted: eventData(secondEvent).interruptedTurnId } : null, duplicate, verdict: failure });
  }
  // M2-06 (budget), in a second product start on the same data: the saved budget is 16000 characters, the workspace rules fill most of it, a continuation sends nothing and says why.
  async function supplementBudget() {
    await supplementBootstrap(); const conv = await conversationId(); const configured = ((await snapshot()).contextWindow || {}).budgetChars;
    const taskId = 'a2-budget-task'; const goal = 'a2-rules'; const small = textFile('AGENTS.md');
    const filler = `# A2-RULE-MARKER-BIG\n${'Budget filler line for the non-compressible context of the continuation request.\n'.repeat(300)}`;
    if (Buffer.byteLength(filler, 'utf8') >= 32 * 1024) throw new Error('A9_36_BUDGET_FILLER_TOO_LARGE');
    fs.writeFileSync(localFile('AGENTS.md'), filler, 'utf8');
    const recovery0 = await injectInterrupted(conv, taskId, 'a2-budget-old-turn', goal);
    const diagnostic = async (turnId) => {
      const failed = (await events(conv, 1000)).events.filter((e) => e.turnId === turnId && e.eventType === 'turn_failed').map(eventData)[0] || {};
      return { code: failed.code, budgetChars: failed.budgetChars, estimatedChars: failed.estimatedChars, error: failed.error };
    };
    const click = async (label, recoveryBefore) => {
      const before = await continueState(conv, taskId); const all = await clickAndSettle(conv, taskId, label); const after = await continueState(conv, taskId);
      const turnId = all[all.length - 1].turnId; const recoveryAfter = await waitFor(async () => { const r = await findRecovery(taskId); return r && r.interruptedTurnId !== recoveryBefore.interruptedTurnId ? r : null; }, 30000, 'recovery after ' + label).catch(() => null);
      return { before, after, turnId, recoveryBefore, recoveryAfter, diagnostic: await diagnostic(turnId) };
    };
    const first = await click('budget first', recovery0);
    const firstVerdict = evaluateBudgetClick({ before: first.before, after: first.after, diagnostic: first.diagnostic, configured_budget: configured, recovery_before: first.recoveryBefore, recovery_after: first.recoveryAfter });
    supplementAssert('m2-verification', 12, configured === 16000 && firstVerdict.ok, { configured_budget_in_snapshot: configured, agents_chars: filler.length, first: { ...first, recoveryBefore: undefined, recoveryAfter: undefined }, verdict: firstVerdict });
    const second = await click('budget second, same condition', first.recoveryAfter || recovery0);
    const secondVerdict = evaluateBudgetClick({ before: second.before, after: second.after, diagnostic: second.diagnostic, configured_budget: configured, recovery_before: second.recoveryBefore, recovery_after: second.recoveryAfter });
    fs.writeFileSync(localFile('AGENTS.md'), small, 'utf8');
    const lineStart = providerLines().length;
    const third = await click('budget third, condition changed', second.recoveryAfter || first.recoveryAfter || recovery0);
    const fitLine = providerLines().slice(lineStart).filter((r) => !r.probe && r.continuation === true)[0] || null;
    const changed = evaluateBudgetChanged({ before: third.before, after: third.after, chars: fitLine ? fitLine.chars : null, configured_budget: configured, turn_status: turnStatus(third.turnId) });
    supplementAssert('m2-verification', 13, secondVerdict.ok && changed.ok, { second: { ...second, recoveryBefore: undefined, recoveryAfter: undefined }, second_verdict: secondVerdict,
      third: { ...third, recoveryBefore: undefined, recoveryAfter: undefined }, request_chars: fitLine ? fitLine.chars : null, changed_verdict: changed });
  }

  async function reviewUi(turnId, file) {
    await waitFor(() => exec(`(() => {
      const row=Array.from(document.querySelectorAll('#a9-checkpoint-list .checkpoint-row')).find(r=>r.querySelector('.checkpoint-id')?.textContent===${JSON.stringify(turnId)});
      const button=Array.from(row?.querySelectorAll('.checkpoint-actions button')||[]).find(b=>b.textContent==='查看改动');
      if(button&&!button.disabled){button.click();return true;}return false;})()`), 15000, 'review show changes');
    return waitFor(() => exec(`(() => {
      const row=Array.from(document.querySelectorAll('#a9-checkpoint-list .checkpoint-row')).find(r=>r.querySelector('.checkpoint-id')?.textContent===${JSON.stringify(turnId)});
      const toggle=Array.from(row?.querySelectorAll('.review-file-toggle')||[]).find(b=>b.textContent.includes(${JSON.stringify(file)}));
      if(toggle&&toggle.getAttribute('aria-expanded')!=='true')toggle.click();
      const detail=toggle?.closest('.review-file')?.querySelector('.review-file-detail');
      const diff=detail?.querySelector('.review-file-diff')?.textContent||'';
      return diff.length?{diff,visible:!detail.hidden,tab:document.getElementById('inspector-tab-changes')?.getAttribute('aria-selected')}:null;})()`), 15000, 'review diff');
  }
  async function queueUndo(turnId, file, recall) {
    const clicked = await exec(`(() => {
      const row=Array.from(document.querySelectorAll('#a9-checkpoint-list .checkpoint-row')).find(r=>r.querySelector('.checkpoint-id')?.textContent===${JSON.stringify(turnId)});
      const detail=Array.from(row?.querySelectorAll('.review-file')||[]).find(r=>r.querySelector('.review-file-toggle')?.textContent.includes(${JSON.stringify(file)}))?.querySelector('.review-file-detail');
      const button=Array.from(detail?.querySelectorAll('button')||[]).find(b=>b.textContent==='撤销此文件');if(!button||button.disabled)return false;button.click();return true;})()`);
    if (!clicked) throw new Error('A9_36_UNDO_NOT_CLICKED');
    if (recall) {
      await waitFor(() => exec(`(() => {const b=Array.from(document.querySelectorAll('.review-pending button')).find(x=>x.textContent==='撤回');if(!b||b.disabled)return false;b.click();return true;})()`), 1800, 'recall undo');
      return waitFor(() => exec('document.getElementById("a9-undo-state").textContent').then((t) => /已撤回撤销/.test(t) ? t : null), 15000, 'undo recalled');
    }
    // An ordinary undo runs by itself after the 5 s countdown. The product asks for a confirmation only after a crash reconciliation (needsConfirmation),
    // so the confirm button is clicked only when it really appears, and the click is recorded.
    const outcomeText = /已撤销|外部修改|又被修改/;
    const reached = await waitFor(() => exec(`(() => {const b=Array.from(document.querySelectorAll('.review-confirmation button')).find(x=>x.textContent==='确认撤销');
      if(b&&!b.disabled){b.click();return {confirmation_clicked:true};}
      const t=document.getElementById('a9-undo-state').textContent;return ${outcomeText}.test(t)?{text:t}:null;})()`), 20000, 'undo outcome or confirmation');
    if (reached.text) return reached.text;
    return waitFor(() => exec('document.getElementById("a9-undo-state").textContent').then((t) => outcomeText.test(t) ? t : null), 15000, 'undo outcome after confirmation');
  }
  async function supplementReview() {
    await supplementBootstrap(); const first = await supplementTurn('a2-review:1'); const review = await exec(`window.win7Agent.a9.getDiff(${JSON.stringify(first.turnId)})`);
    const ui = await reviewUi(first.turnId, 'probe.txt'); const paths = (review.review?.files || []).map((v) => v.path);
    supplementAssert('m3-review', 1, review.ok === true && paths.includes('probe.txt') && paths.includes('notes.md') && ui.visible && ui.tab === 'true' && ui.diff.includes('value'), { review, ui, turn: first.data });
    await reviewUi(first.turnId, 'notes.md'); const hashBefore = sha256(fs.readFileSync(localFile('notes.md')));
    const recalled = await queueUndo(first.turnId, 'notes.md', true); await sleep(5200);
    supplementAssert('m3-review', 2, recalled.includes('已撤回撤销') && sha256(fs.readFileSync(localFile('notes.md'))) === hashBefore, { recalled, hashBefore, after: sha256(fs.readFileSync(localFile('notes.md'))) });
    await reviewUi(first.turnId, 'notes.md'); const undone = await queueUndo(first.turnId, 'notes.md', false);
    supplementAssert('m3-review', 3, undone.includes('已撤销') && !fs.existsSync(localFile('notes.md')) && textFile('probe.txt') === 'value 1\n', { undone, probe: textFile('probe.txt'), notes_exists: fs.existsSync(localFile('notes.md')) });
    const second = await supplementTurn('a2-review:2'); fs.writeFileSync(localFile('b.txt'), 'external drift\n', 'utf8');
    const drift = await exec(`window.win7Agent.a9.undoTurn(${JSON.stringify(second.turnId)})`);
    supplementAssert('m3-review', 4, drift.ok === true && textFile('a.txt') === 'a0\n' && textFile('b.txt') === 'external drift\n'
      && (drift.driftReasons || []).some((r) => r.path === 'b.txt'), { drift, a: textFile('a.txt'), b: textFile('b.txt') });
    const third = await supplementTurn('a2-review:3');
    await waitFor(() => fs.existsSync(localFile('start-effect.txt')) ? true : null, 30000, 'start_process effect');
    await stopAllManaged();
    const externalReview = await exec(`window.win7Agent.a9.getDiff(${JSON.stringify(third.turnId)})`);
    const externalPaths = (externalReview.review?.files || []).map((v) => v.path);
    const undo = await exec(`window.win7Agent.a9.undoTurn(${JSON.stringify(third.turnId)})`);
    supplementAssert('m3-review', 5, externalPaths.includes('shell-effect.txt') && externalPaths.includes('start-effect.txt') && undo.ok === true
      && !fs.existsSync(localFile('shell-effect.txt')) && !fs.existsSync(localFile('start-effect.txt')), { externalReview, undo, terminal: third.data });
    const fourth = await supplementTurn('a2-review:4');
    const later = await exec(`window.win7Agent.a9.undoFile(${JSON.stringify(first.turnId)}, 'probe.txt')`);
    const guarded = textFile('probe.txt') === 'value 4\n' && (later.driftReasons || []).some((r) => r.path === 'probe.txt' && r.kind === 'later_turn' && r.laterTurnId === fourth.turnId);
    const undoFourth = await exec(`window.win7Agent.a9.undoTurn(${JSON.stringify(fourth.turnId)})`);
    const whole = await exec(`window.win7Agent.a9.undoTurn(${JSON.stringify(first.turnId)})`);
    const next = await supplementTurn('a2-rules'); const ignore = textFile('.agent_recovery/.gitignore');
    supplementAssert('m3-review', 6, guarded && undoFourth.ok === true && whole.ok === true && textFile('probe.txt') === 'value 0\n' && next.turnId !== third.turnId
      && ['completed', 'completed_with_warnings'].includes(next.data.outcome) && ignore === '*\n', { later, guarded, undoFourth, whole, next: next.data, recovery_ignore: ignore,
        persisted_checkpoints: dbAll('SELECT turn_id FROM a9_checkpoints ORDER BY rowid'), zero_replay: 'INHERITED_EVIDENCE_WIN7_45_E03_E06_NOT_RERUN' });
    // M3-01: an edit and a Shell that rewrites an EXISTING file; B0 before, B1 after, B2 after the per-file undo and the whole-Turn undo.
    const shellFiles = [['ext_edit.txt', 'edit1\n'], ['ext_shell.txt', 'shell1\n']];
    const shellB0 = Object.fromEntries(shellFiles.map(([name]) => [name, fileSha(name)]));
    const ext = await supplementTurn('a2-ext:shell');
    const extReview = await exec(`window.win7Agent.a9.getDiff(${JSON.stringify(ext.turnId)})`);
    const shellB1 = Object.fromEntries(shellFiles.map(([name]) => [name, { sha: fileSha(name), text: textFile(name) }]));
    const extFileUndo = await exec(`window.win7Agent.a9.undoFile(${JSON.stringify(ext.turnId)}, 'ext_shell.txt')`);
    const shellAfterFile = Object.fromEntries(shellFiles.map(([name]) => [name, fileSha(name)]));
    const extWholeUndo = await exec(`window.win7Agent.a9.undoTurn(${JSON.stringify(ext.turnId)})`);
    const shellVerdict = evaluateExternalBytes({ review_paths: (extReview.review?.files || []).map((v) => v.path), undo_results: [extFileUndo, extWholeUndo], drift_results: [extFileUndo], require_per_file: true, per_file: { path: 'ext_shell.txt', result: extFileUndo, after: shellAfterFile },
      files: shellFiles.map(([name, expected]) => ({ path: name, b0: shellB0[name], b1: shellB1[name].sha, b1_text: shellB1[name].text, expected_b1_text: expected, b2: fileSha(name) })) });
    supplementAssert('m3-review', 7, shellVerdict.ok, { b0: shellB0, b1: shellB1, b2: Object.fromEntries(shellFiles.map(([name]) => [name, fileSha(name)])), after_file_undo: shellAfterFile, review: extReview, undo: [extFileUndo, extWholeUndo], terminal: ext.data, verdict: shellVerdict });
    // M3-02: a continuation Turn's checkpoint belongs to that Turn; its edit is undone.
    const conv = await conversationId(); const contTask = 'a2-cont-edit-task'; const oldTurn = 'a2-cont-edit-old-turn';
    await injectInterrupted(conv, contTask, oldTurn, 'a2-cont-edit:1');
    const contB0 = textFile('cont_target.txt');
    const contEvents = await clickAndSettle(conv, contTask, 'cont edit'); const contTurn = contEvents[contEvents.length - 1].turnId;
    const contB1 = textFile('cont_target.txt'); const contReview = await exec(`window.win7Agent.a9.getDiff(${JSON.stringify(contTurn)})`);
    const contCheckpoint = dbAll('SELECT turn_id, session_id FROM a9_checkpoints WHERE turn_id = ?', contTurn)[0] || null;
    const oldCheckpoints = dbAll('SELECT count(*) AS n FROM a9_checkpoints WHERE turn_id = ?', oldTurn)[0].n;
    const contUndo = await exec(`window.win7Agent.a9.undoTurn(${JSON.stringify(contTurn)})`);
    const contVerdict = evaluateContinuationCheckpoint({ continuation_turn_id: contTurn, continue_events: contEvents.length, turn_status: turnStatus(contTurn), b0_text: contB0, b1_text: contB1, b2_text: textFile('cont_target.txt'),
      checkpoint: contCheckpoint, conversation_id: conv, old_turn_checkpoints: oldCheckpoints, review_paths: (contReview.review?.files || []).map((v) => v.path), undo_ok: contUndo && contUndo.ok === true });
    supplementAssert('m3-review', 8, contVerdict.ok, { continuation_turn: contTurn, checkpoint: contCheckpoint, old_turn_checkpoints: oldCheckpoints, review: contReview, undo: contUndo, verdict: contVerdict });
    // M3-03: start_process rewrites an existing file; the Turn ends after the process wrote (the fixture delays its final answer).
    const bgB0 = fileSha('ext_bg.txt'); const bg = await supplementTurn('a2-ext:bg');
    await waitFor(() => textFile('ext_bg.txt') === 'bg1\n' ? true : null, 30000, 'start_process rewrote existing file'); await stopAllManaged();
    const bgReview = await exec(`window.win7Agent.a9.getDiff(${JSON.stringify(bg.turnId)})`); const bgB1 = { sha: fileSha('ext_bg.txt'), text: textFile('ext_bg.txt') };
    const bgUndo = await exec(`window.win7Agent.a9.undoTurn(${JSON.stringify(bg.turnId)})`);
    const bgVerdict = evaluateExternalBytes({ review_paths: (bgReview.review?.files || []).map((v) => v.path), undo_results: [bgUndo],
      files: [{ path: 'ext_bg.txt', b0: bgB0, b1: bgB1.sha, b1_text: bgB1.text, expected_b1_text: 'bg1\n', b2: fileSha('ext_bg.txt') }] });
    supplementAssert('m3-review', 9, bgVerdict.ok, { b0: bgB0, b1: bgB1, b2: fileSha('ext_bg.txt'), review: bgReview, undo: bgUndo, terminal: bg.data, verdict: bgVerdict });
    // M3-04 (ADR-0243): a background process writes the file again after the post-Turn baseline was collected and shown; undo keeps those bytes and names the path.
    const late = await supplementTurn('a2-late:1');
    const lateReview = await exec(`window.win7Agent.a9.getDiff(${JSON.stringify(late.turnId)})`); const lateUi = await reviewUi(late.turnId, 'late_target.txt');
    const lateB1 = { sha: fileSha('late_target.txt'), text: textFile('late_target.txt') };
    fs.writeFileSync(localFile('late.go'), 'go\n', 'utf8');
    await waitFor(() => textFile('late_target.txt') === 'late2\n' ? true : null, 30000, 'late write');
    const lateAfterWrite = { sha: fileSha('late_target.txt'), text: textFile('late_target.txt') }; const lateTreeBefore = workspaceTree();
    const lateUndo = await exec(`window.win7Agent.a9.undoTurn(${JSON.stringify(late.turnId)})`);
    await sleep(1500); const lateTreeAfter = workspaceTree(); const undoState = await exec('document.getElementById("a9-undo-state") ? document.getElementById("a9-undo-state").textContent : null');
    await stopAllManaged();
    const lateVerdict = evaluateLateWrite({ review_ok: lateReview.ok === true && lateUi.visible === true, review_paths: (lateReview.review?.files || []).map((v) => v.path), b1: lateB1.sha, b1_text: lateB1.text,
      late: lateAfterWrite.sha, late_text: lateAfterWrite.text, after_undo: fileSha('late_target.txt'), drifted_paths: (lateUndo.driftReasons || []).map((r) => r.path), undo_ok: lateUndo && lateUndo.ok === true,
      tree_before: lateTreeBefore, tree_after: lateTreeAfter });
    supplementAssert('m3-review', 10, lateVerdict.ok, { b1: lateB1, late: lateAfterWrite, after_undo: { sha: fileSha('late_target.txt'), text: textFile('late_target.txt') }, undo: lateUndo, undo_state_text: undoState,
      review: lateReview, ui_visible: lateUi.visible, verdict: lateVerdict, ui_wording: 'observation only (PRD A9-F03 has no verbatim wording)' });
    // What the restart Stage of M3-05 compares against: the counts, the files and the first Turn's review at the end of this Stage.
    out('a2-m3-end-state.json', { conversation_id: conv, first_turn_id: first.turnId, first_review_paths: paths, counts: reviewCounts(conv), tree: workspaceTree() });
  }
  // M3-05: the product is restarted on the data of the review Stage (same conversation, same checkpoints); nothing is replayed and the journey goes on.
  async function supplementReviewRestart() {
    const priorDir = env.A9_ALPHA2_PRIOR_STAGE_DIR; if (!priorDir) throw new Error('A9_36_PRIOR_STAGE_MISSING');
    const prior = JSON.parse(fs.readFileSync(path.join(priorDir, 'a2-m3-end-state.json'), 'utf8'));
    await supplementBootstrap(); const conv = await conversationId();
    const requestsAtStart = (await counters()).requests; await sleep(3000);
    const requestsAfterWait = (await counters()).requests; const counts = reviewCounts(conv); const tree = workspaceTree();
    const review = await exec(`window.win7Agent.a9.getDiff(${JSON.stringify(prior.first_turn_id)})`);
    const reundo = await exec(`window.win7Agent.a9.undoTurn(${JSON.stringify(prior.first_turn_id)})`); const treeAfterUndo = workspaceTree();
    const requestsBeforeNext = (await counters()).requests; const next = await supplementTurn('a2-rules'); const requestsAfterNext = (await counters()).requests;
    const verdict = evaluateReviewRestart({ prior, conversation_id: conv, requests_at_start: requestsAtStart, requests_after_wait: requestsAfterWait, counts, tree,
      review_ok: review && review.ok === true, review_paths: ((review && review.review && review.review.files) || []).map((v) => v.path), reundo, tree_after_undo: treeAfterUndo,
      next_outcome: next.data.outcome, next_turn_id: next.turnId, next_requests: requestsAfterNext - requestsBeforeNext });
    supplementAssert('m3-review', 11, verdict.ok, { prior, conversation_id: conv, requests: { at_start: requestsAtStart, after_wait: requestsAfterWait, before_next: requestsBeforeNext, after_next: requestsAfterNext }, counts, tree_files: tree.length,
      review_paths: ((review && review.review && review.review.files) || []).map((v) => v.path), reundo, next: next.data, verdict });
  }
  // M5 precondition rehearsal (fixture Provider, no real service): a managed process is alive, a Provider change is refused with the expected code and touches nothing.
  async function supplementProviderGuard() {
    await supplementBootstrap(); await newConversation();
    await supplementTurn('a2-bg-hold');
    const running = await waitFor(async () => (await snapshot()).managedProcesses.find((p) => p.lastProbeStatus === 'running') || null, 60000, 'managed process running');
    const before = await snapshot(); const c0 = await counters();
    const attempt = await exec(`window.win7Agent.a9.configureProvider(${JSON.stringify({ baseUrl: fixtureUrl, model: 'a2-guard-model-changed' })})`);
    const after = await snapshot(); const c1 = await counters();
    const still = after.managedProcesses.find((p) => p.handleId === running.handleId) || null;
    let stopError = null;
    try { await stopAllManaged(); } catch (error) { stopError = String(error && error.message ? error.message : error).slice(0, 200); }
    const verdict = evaluateProviderGuard({ running_before: running.lastProbeStatus === 'running', attempt_ok: attempt && attempt.ok, attempt_code: attempt && attempt.error ? attempt.error.code : null,
      running_after: Boolean(still) && still.lastProbeStatus === 'running', pid_before: running.pid, pid_after: still ? still.pid : null, model_before: (before.provider || {}).model, model_after: (after.provider || {}).model,
      base_url_before: (before.provider || {}).baseUrl, base_url_after: (after.provider || {}).baseUrl, requests_before: c0.requests, requests_after: c1.requests });
    supplementAssert('m5-journey', 6, verdict.ok && stopError === null, { handle: running.handleId, attempt, expected_rejection: 'A9_PROVIDER_MANAGED_ACTIVE', counted_as_failure: false, stop_error: stopError, verdict });
  }

  const realNetwork = { requests: 0, response_bytes: 0, tls: [], limit_rejected: false, bodies: [], body_errors: 0 };
  function installRealProviderBudget() {
    const https = require('https'); const original = https.request;
    const expected = JSON.parse(env.A9_ALPHA2_PROVIDER || '{}');
    if (expected.base_url !== 'https://api.deepseek.com' || expected.model !== 'deepseek-v4-flash' || expected.max_requests !== 40 || expected.max_response_bytes !== 1048576) throw new Error('A9_36_PROVIDER_BUDGET');
    https.request = function(options, callback) {
      if (!options || options.hostname !== 'api.deepseek.com' || options.protocol !== 'https:' || options.rejectUnauthorized !== true || options.ca || options.checkServerIdentity || options.createConnection || options.agent) throw new Error('A9_36_PROVIDER_TLS_OPTIONS');
      if (realNetwork.requests >= expected.max_requests) { realNetwork.limit_rejected = true; throw new Error('A9_36_PROVIDER_REQUEST_LIMIT'); }
      realNetwork.requests++;
      const req = original.call(this, options, (response) => {
        response.on('data', (chunk) => { realNetwork.response_bytes += chunk.length; if (realNetwork.response_bytes > expected.max_response_bytes) { realNetwork.limit_rejected = true; req.destroy(new Error('A9_36_PROVIDER_RESPONSE_LIMIT')); } });
        if (callback) callback(response);
      });
      // Only hashes of the system message leave this wrapper; the request body itself is neither stored nor logged.
      const chunks = []; let captured = 0;
      const take = (chunk) => { if (chunk === undefined || chunk === null || typeof chunk === 'function') return; const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)); captured += buffer.length; if (captured <= 4 * 1024 * 1024) chunks.push(buffer); };
      const originalWrite = req.write.bind(req); const originalEnd = req.end.bind(req);
      req.write = function(chunk, ...rest) { take(chunk); return originalWrite(chunk, ...rest); };
      req.end = function(chunk, ...rest) {
        take(chunk);
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); const system = (body.messages || []).find((m) => m.role === 'system');
          const content = system ? (typeof system.content === 'string' ? system.content : JSON.stringify(system.content)) : null;
          realNetwork.bodies.push({ model: body.model, probe: (body.tools || []).some((t) => t.function && t.function.name === 'probe_test_echo'), system_sha256: content === null ? null : sha256(content), system_chars: content === null ? 0 : content.length, messages: (body.messages || []).length });
        } catch (_error) { realNetwork.body_errors++; }
        return originalEnd(chunk, ...rest);
      };
      req.on('socket', (socket) => socket.once('secureConnect', () => { realNetwork.tls.push({ authorized: socket.authorized === true, protocol: socket.getProtocol(), host: options.hostname }); }));
      return req;
    };
  }
  async function supplementRealModel() {
    await waitFor(() => exec('document.readyState === "complete"'), 30000, 'real model renderer');
    await selectWorkspace(); await ensureMode();
    let snap = await snapshot(); let p = snap.provider || {};
    const restored = p.configured === true && p.baseUrl.replace(/\/$/, '') === 'https://api.deepseek.com' && p.model === 'deepseek-v4-flash'
      && p.apiKey?.available === true && p.apiKey?.source === 'dpapi' && !p.proxy && !p.caBundle && !p.diagnostics;
    // The restored configuration carries no probe record, and the page keeps sending disabled until the product's own probe classifies the Provider as tool_calling.
    // The probe runs through the public page control; its requests go through the same counted network wrapper and use part of the 40-request budget.
    let probe = null; let probeRequests = 0; let probeError = null;
    if (restored) {
      const requestsBefore = realNetwork.requests;
      try {
        await exec('document.getElementById("a9-provider-probe").click(); true');
        probe = await waitFor(async () => { const s = await snapshot(); const c = s.provider && s.provider.probe; return c && c.classification && c.classification !== 'skipped' ? c : null; }, 120000, 'real provider probe');
      } catch (error) { probeError = String(error && error.message ? error.message : error).slice(0, 200); }
      probeRequests = realNetwork.requests - requestsBefore; snap = await snapshot(); p = snap.provider || {};
    }
    const ready = restored && probe !== null && probe.classification === 'tool_calling' && p.probe?.classification === 'tool_calling';
    supplementAssert('m5-journey', 1, ready, { configured: p.configured, model: p.model, key_available: p.apiKey?.available, key_source: p.apiKey?.source, key_remembered: p.apiKey?.remembered, custom_ca: Boolean(p.caBundle), proxy: Boolean(p.proxy),
      restored, probe_classification: probe ? probe.classification : null, probe_latency_ms: probe ? probe.latencyMs : null, probe_requests: probeRequests, probe_error: probeError });
    if (!ready) throw new Error('A9_36_SAVED_PROVIDER_NOT_READY');
    const j1 = await supplementTurn('只读解释此项目。先读取AGENTS.md、README.md及相关源码，说明add缺陷，引用严格写成calc.py:1和calc.py:2，对应实际行内容并分别引用完整代码行。最终回答必须含原句“add 应做加法，实际做减法”。不要修改文件，不执行Shell。', 300000);
    const modelText = typeof j1.data.finalMessage === 'string' ? j1.data.finalMessage : '';
    const citations = journeyReadCitations(j1.events, workspaceRoot, modelText, textFile('calc.py') || '', { 'AGENTS.md': textFile('AGENTS.md'), 'README.md': textFile('README.md') });
    supplementAssert('m5-journey', 2, citations.ok && !j1.events.some((e) => e.eventType === 'tool_start' && ['edit', 'write', 'delete', 'copy', 'move', 'shell', 'start_process'].includes(eventData(e).toolName))
      && textFile('calc.py') === 'def add(a, b):\n    return a - b\n', { turn: j1.data, model_text: modelText, citations });
    const j2 = await supplementTurn('修复README描述的add缺陷。先运行python test_calc.py保留真实失败，再读相关文件并修改，再运行同一测试直到成功。本轮只修改calc.py，不改test_calc.py、build.py和acceptance_check.py。测试命令必须原样使用python test_calc.py，完成后如实说明验证状态。不要安装依赖或提交。', 600000);
    const shells = journeyShellChecks(j2.events, workspaceRoot, 'python test_calc.py');
    const failTest = shells.find((e) => e.shell?.exitCode !== 0 && /FAIL|AssertionError/.test((e.shell?.stdout || '') + (e.shell?.stderr || '')));
    const passTest = shells.find((e) => failTest && e.eventId > failTest.eventId && e.shell?.exitCode === 0 && /OK/.test((e.shell?.stdout || '') + (e.shell?.stderr || '')));
    const j2Diff = await exec(`window.win7Agent.a9.getDiff(${JSON.stringify(j2.turnId)})`);
    supplementAssert('m5-journey', 3, Boolean(failTest && passTest) && j2.events.some((e) => e.eventType === 'tool_start' && ['edit','write'].includes(eventData(e).toolName) && e.eventId > failTest.eventId && e.eventId < passTest.startId)
      && textFile('test_calc.py') === supplementModule().JOURNEY_FILES['test_calc.py'] && j2.data.verification === 'verified' && j2.data.verificationEvidence?.command === 'python test_calc.py' && j2Diff.ok === true
      && (j2Diff.review?.files || []).some((f) => f.path === 'calc.py'), { turn: j2.data, tests: shells, diff: j2Diff });
    const j3 = await supplementTurn('增加跨文件小功能：calc.py加入multiply(a,b)；display.py加入format_product(a,b)，返回乘积的字符串；test_calc.py新增至少2个测试覆盖正数和负数。先展示新测试失败，再实现，测试和构建命令必须原样使用python test_calc.py和python build.py。最后必须原样运行python acceptance_check.py通过独立功能检查；不要修改build.py和acceptance_check.py。保留原功能，不安装依赖，不提交。', 600000);
    const j3Shells = journeyShellChecks(j3.events, workspaceRoot, 'python test_calc.py');
    const builds = journeyShellChecks(j3.events, workspaceRoot, 'python build.py');
    const functional = journeyShellChecks(j3.events, workspaceRoot, 'python acceptance_check.py');
    const guardedScripts = ['build.py','acceptance_check.py'].every((n) => textFile(n) === supplementModule().JOURNEY_FILES[n]);
    const j3Fail = j3Shells.findIndex((e) => e.shell?.exitCode !== 0 && /FAIL|Error/.test((e.shell?.stdout || '') + (e.shell?.stderr || '')));
    const j3Pass = j3Shells.findIndex((e, index) => index > j3Fail && e.shell?.exitCode === 0 && /Ran [4-9]\d* tests/.test((e.shell?.stdout || '') + (e.shell?.stderr || '')) && /OK/.test((e.shell?.stdout || '') + (e.shell?.stderr || '')));
    const j3Diff = await exec(`window.win7Agent.a9.getDiff(${JSON.stringify(j3.turnId)})`);
    const changed = (j3Diff.review?.files || []).map((f) => f.path);
    const ui = await reviewUi(j3.turnId, 'calc.py');
    await screenshot('a2-m5-final-diff.png');
    supplementAssert('m5-journey', 4, ['calc.py', 'display.py', 'test_calc.py'].every((n) => changed.includes(n)) && j3.data.verification === 'verified'
      && j3Fail >= 0 && j3Pass > j3Fail && guardedScripts && builds.some((e) => e.shell?.exitCode === 0 && /A2-BUILD-PASS/.test(e.shell?.stdout || ''))
      && j3Shells.some((e) => e.shell?.exitCode === 0 && /OK/.test((e.shell?.stdout || '') + (e.shell?.stderr || '')))
      && functional.some((e) => e.shell?.exitCode === 0 && /A2-FUNCTIONAL-CONTRACT-PASS/.test(e.shell?.stdout || ''))
      && j3.data.verificationEvidence?.command === 'python acceptance_check.py'
      && ui.visible && realNetwork.requests > 0 && realNetwork.requests <= 40 && !realNetwork.limit_rejected && realNetwork.tls.length > 0 && realNetwork.tls.every((t) => t.authorized),
      { turn: j3.data, tests: j3Shells, builds, functional, guardedScripts, changed, ui, network: { ...realNetwork, bodies: undefined, body_count: realNetwork.bodies.length } });
    // M5 precondition: the system prompt body of the real requests, by hash; the version marker is the constant the product ships and cannot tell two bodies apart.
    let promptVersion = null;
    try { promptVersion = require(path.join(candidateRoot, 'resources', 'app', 'core', 'dist', 'system-prompt.js')).A9_SYSTEM_PROMPT_VERSION; } catch (_error) { promptVersion = null; }
    const bodies = realNetwork.bodies.filter((b) => !b.probe); const promptVerdict = evaluateSystemPromptBody({ bodies, expected_model: 'deepseek-v4-flash', system_prompt_version: promptVersion });
    supplementAssert('m5-journey', 5, promptVerdict.ok && realNetwork.body_errors === 0, { system_prompt_version_marker: promptVersion, bodies: realNetwork.bodies, body_errors: realNetwork.body_errors, verdict: promptVerdict,
      note: 'hashes only; the marker does not distinguish two bodies, the hash does' });
  }

  // ---- Dispatcher ------------------------------------------------------------------------------------------------------------------
  const MODE_TABLE = {
    chain_a: chainA, chain_interrupt: chainInterrupt, chain_recover: chainRecover, chain_exit: chainExit,
    stream_live: streamLive, stream_encodings: streamEncodings, stream_limits: streamLimits, audit_stop: auditStop,
    session_bg: sessionBg, session_restart: sessionRestart, release_exit: releaseExit,
    continue_guards: continueGuards, continue_interrupt: continueInterrupt, continue_restart: continueRestart, continue_unknown_interrupt: continueUnknownInterrupt,
    continue_mode_guard: continueModeGuard, continue_unknown: continueUnknown,
    safe_rules: safeRules, ui_interrupt: uiInterrupt, ui_continue: uiContinue, ui_layouts: uiLayouts,
  };
  // A separate explicit input is required; the original formal mode set stays closed. Every name here is a Stage of the orchestrator's STAGE_PLAN.
  const SUPPLEMENT_MODE_TABLE = { supplement_continue_schema: continueSchema, supplement_policy_git: supplementPolicyGit,
    supplement_verification: supplementVerification, supplement_audit_output: supplementAuditOutput, supplement_audit_managed: supplementAuditManaged,
    supplement_audit_ownership: supplementAuditOwnership, supplement_continue: supplementContinue, supplement_budget: supplementBudget,
    supplement_review: supplementReview, supplement_review_restart: supplementReviewRestart, supplement_provider_guard: supplementProviderGuard, supplement_real_model: supplementRealModel };

  if (JSON.stringify(Object.keys(SUPPLEMENT_MODE_TABLE)) !== JSON.stringify(SUPPLEMENT_MODES)) throw new Error('A9_36_SUPPLEMENT_MODE_TABLE');

  // Pre-ready seams ---------------------------------------------------------------------------------------------------------------------
  const cmdExecutable = path.join(env.SystemRoot || env.windir || 'C:\\Windows', 'System32', 'cmd.exe');
  dialog.showOpenDialog = async (...args) => openDialogAnswer(args, workspaceRoot, cmdExecutable);
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
      const supplementalInput = MODE === 'supplement_continue_schema' && request.action === 'a9.task.continue' ? continuationRequestFacts(request) : {};
      const result = await listener(...args);
      ipcLog.push({ at: new Date().toISOString(), action: request.action, payload_keys: request.payload && typeof request.payload === 'object' ? Object.keys(request.payload).sort() : [],
        ...supplementalInput, ok: result && result.ok, error: result && result.error ? String(result.error.code || '').slice(0, 80) : null, duplicate: result && result.continuation ? result.continuation.duplicate === true : undefined });
      return result;
    });
  };
  if (MODE === 'supplement_real_model' && env.A9_ALPHA2_SUPPLEMENT_MODE === MODE) installRealProviderBudget();
  require(env.A9_BATCH2_PRODUCT_MAIN);
  if (env.A9_ALPHA2_SUPPLEMENT_MODE === MODE) {
    const expectedUserData = path.join(env.LOCALAPPDATA, 'Win7CodingAgent');
    const runRoot = path.dirname(path.dirname(env.A9_ALPHA2_INPUT_MODULE));
    // Physical location: the nearest existing ancestor is resolved through links and junctions, so a path that only looks like it lies inside the run cannot pass.
    const realOf = (target) => { let current = path.resolve(target); const rest = []; for (;;) { try { return path.join(fs.realpathSync.native(current), ...rest.reverse()); } catch (_error) { const parent = path.dirname(current); if (parent === current) return null; rest.push(path.basename(current)); current = parent; } } };
    const realRun = realOf(runRoot);
    const isolation = evaluateUserDataIsolation({ user_data: path.resolve(app.getPath('userData')), run_root: path.resolve(runRoot) + path.sep, expected: path.resolve(expectedUserData),
      a8_database_exists: fs.existsSync(path.join(app.getPath('userData'), 'state', 'agent-events-v2.db')),
      real: { run_root: realRun ? realRun + path.sep : null, user_data: realOf(app.getPath('userData')), data_root: realOf(env.A9_BATCH2_DATAROOT), workspace: realOf(env.A9_BATCH2_WORKSPACE) } });
    if (!isolation.ok) throw new Error('A9_36_USERDATA_NOT_ISOLATED');
    out('a2-isolated-roots.json', { user_data: app.getPath('userData'), a9_data: dataRoot, portable: env.WIN7AGENT_PORTABLE, verdict: isolation });
  }

  const finish = async (error) => {
    if (ownsExit && !error) return;
    if (env.A9_ALPHA2_SUPPLEMENT_MODE === MODE && !error) {
      try { const tree = myTree(); out('a2-prequit-processes.json', { tree, wmic_failures: wmicFailures, stale_parent_links: [...staleParentLinks.values()] });
        if (wmicFailures > 0 || tree.some((p) => wmiStampMicros(p.created) === null)) throw new Error('A9_36_PREQUIT_TREE_UNKNOWN'); }
      catch (failure) { error = failure; }
    }
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
    const runner = MODE_TABLE[MODE] || (env.A9_ALPHA2_SUPPLEMENT_MODE === MODE && SUPPLEMENT_MODE_TABLE[MODE]);
    if (!runner) throw new Error(`A9_BATCH2_DRIVER_MODE_UNKNOWN:${MODE}`);
    await runner();
    await finish(null);
  } catch (error) {
    ownsExit = false;
    await finish(error);
  }
}

module.exports = {
  continuationSchemaCases, continuationRequestFacts, evaluateContinuationSchema, supplementalRowsFacts, supplementalWorkspaceFacts, supplementalReadOnlyFacts, journeyToolFacts, journeyShellChecks, journeyReadCitations,
  assertionId, eventData, framesFromEvents, classifyFailedStart, evaluateBg03Facts, evaluateReleaseSequence, exitDialogFacts, BAD_CWD_PATHS, RELEASE_SEQUENCE, evaluateStreamOrder, textsPerStream, evaluateDomAfterDb, evaluateLiveTick, backgroundObservationDone, evaluateBackgroundOutput, evaluateSecretCheck, evaluateStreamedOnce, managedResidueItems, managedFactSummary, toolEndResult, secretLeak,
  descendantsOf, wmiStampMicros, stillAlive, newProcesses, toolEndsFor, summarizeToolEnd, toolEndFailed, normalizeCrlf, combineStatus, evaluatePaging, sha256, EXIT_BUTTONS,
  subResult, summarizeSubs, guardRefused, withGuard, statusOf, retryableStopStatus, stopLeavesActionableCard, evaluateUiLayouts, evaluateUiJourney, storedHasToken, OUTPUT_TOKEN_PATTERN,
  keyEventsFor, summarizeKeyPress, KEY_RECORDER_SOURCE, evaluateAuditHardStop, evaluateEncodingOutcomes, ENCODING_GATING, AUDIT_FAILURE_CODE, evaluateTerminalAudit, evaluateRestartCounts, evaluateOldTurnUnchanged, evaluateInterruptRecords, isCount, isStatusText,
  insertInterruptedTask, insertResidueFact, deleteResidueFact, findModeSettingsFile, CORRUPT_MODE_SETTINGS,
  SUPPLEMENT_MODES, SUP_RESTORED_NOTES, supRestoredFor, openDialogAnswer, evaluateGitDenials, evaluateOriginRefs, evaluateLocalBranch, evaluateTestStream, evaluateBuildCancel, evaluateLongCard, evaluateF01, evaluateInputShas, evaluateAuditStage,
  evaluateContinueReload, evaluateProviderFailureContinue, evaluateBudgetClick, evaluateBudgetChanged, evaluateExternalBytes, evaluateContinuationCheckpoint,
  evaluateLateWrite, evaluateReviewRestart, evaluateSystemPromptBody, evaluateProviderGuard, evaluateUserDataIsolation,
};

if (process.versions.electron && process.env.A9_BATCH2_MODE) {
  runDriver().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(2);
  });
}
