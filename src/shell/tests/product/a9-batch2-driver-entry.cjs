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
    await exec('(() => { const b = document.getElementById("conversation-new"); if (b && !b.disabled) b.click(); return true; })()');
    return waitFor(async () => { const id = await conversationId(); return id && id !== before ? id : null; }, 20000, 'new conversation');
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
      && (manifestEntry('resources/app/product/main.js') || {}).sha256 === mainSha && runtimeJson.candidate === 'WIN7-43' && snap.status === 'ready';
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
    out('03-process-tree.json', { before: treeBefore, survivors, after_total: treeAfter.length });
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
    out('chain-exit-tree-before.json', { driver_pid: process.pid, tree, wmic_failures: wmicFailures, running: running.map((item) => ({ handleId: item.handleId, pid: item.pid })) });
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
    const afterTree = descendantsOf(wmicRows(), process.pid);
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
    // Rehearsal 4 read residue=1 and kept no item, so the cause is UNKNOWN. A lagging status of the fast-failing process is one candidate.
    // Residue is therefore judged after a bounded settle (20 s), and the first read, every later read and the settled facts are all recorded.
    const settle = [];
    const settleStarted = Date.now();
    let snapFail = await snapshot();
    settle.push({ t: 0, residue: managedResidueItems(snapFail.managedProcesses).map(managedFactSummary) });
    while (managedResidueItems(snapFail.managedProcesses).length > 0 && Date.now() - settleStarted < 20000) {
      await sleep(500);
      snapFail = await snapshot();
      settle.push({ t: Date.now() - settleStarted, residue: managedResidueItems(snapFail.managedProcesses).map(managedFactSummary) });
    }
    const residue = managedResidueItems(snapFail.managedProcesses);
    out('bg03-stop-release.json', { stops: stops.map(summarizeToolEnd), after_stop_facts: snapStop.managedProcesses.map((item) => ({ handleId: item.handleId, status: item.lastProbeStatus, ownership: item.ownershipState })),
      ready_fail: startFail.map(summarizeToolEnd), residue_after_fail: residue.length, residue_items: residue.map(managedFactSummary), settle_samples: settle.slice(-30), settled_after_ms: residue.length === 0 ? settle[settle.length - 1].t : null,
      all_facts_after_fail: snapFail.managedProcesses.map(managedFactSummary) });
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
  assertionId, eventData, framesFromEvents, evaluateStreamOrder, textsPerStream, evaluateDomAfterDb, evaluateLiveTick, backgroundObservationDone, evaluateBackgroundOutput, evaluateSecretCheck, evaluateStreamedOnce, managedResidueItems, managedFactSummary, toolEndResult, secretLeak,
  descendantsOf, stillAlive, newProcesses, toolEndsFor, summarizeToolEnd, toolEndFailed, normalizeCrlf, combineStatus, evaluatePaging, sha256, EXIT_BUTTONS,
  subResult, summarizeSubs, guardRefused, withGuard, statusOf, retryableStopStatus, stopLeavesActionableCard, evaluateUiLayouts, evaluateUiJourney, storedHasToken, OUTPUT_TOKEN_PATTERN,
  keyEventsFor, summarizeKeyPress, KEY_RECORDER_SOURCE, evaluateAuditHardStop, evaluateEncodingOutcomes, ENCODING_GATING, AUDIT_FAILURE_CODE, evaluateTerminalAudit, evaluateRestartCounts, evaluateOldTurnUnchanged, evaluateInterruptRecords, isCount, isStatusText,
  insertInterruptedTask, insertResidueFact, deleteResidueFact, findModeSettingsFile, CORRUPT_MODE_SETTINGS,
};

if (process.versions.electron && process.env.A9_BATCH2_MODE) {
  runDriver().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(2);
  });
}
