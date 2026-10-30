'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { context, safe, createWriter } = require('./event-log');
const PREFIX_BYTES = 65536;
const OUTPUT_LIMIT = 1048576;
function main() {
  if (process.argv.length !== 5) throw new Error('ARGUMENT_COUNT');
  const ctx = context(process.argv[2], process.argv[3], process.argv[4]);
  const event = createWriter(ctx, 'capturer');
  const claim = process.pid + '\tUNKNOWN\n';
  const claimPath = path.win32.join(ctx.dir, 'capturer-claim.tsv');
  const ackPath = path.win32.join(ctx.dir, 'capturer-ack.tsv');
  safe(claimPath);
  fs.writeFileSync(claimPath, claim, { encoding: 'utf8', flag: 'wx' });
  const deadline = process.hrtime.bigint() + 5000000000n;
  let handshake;
  function launch() {
    const env = { ...process.env };
    const present = { ELECTRON_RUN_AS_NODE: Object.prototype.hasOwnProperty.call(env, 'ELECTRON_RUN_AS_NODE'), NODE_OPTIONS: Object.prototype.hasOwnProperty.call(env, 'NODE_OPTIONS') };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    env.A9_DIAG_ROOT = ctx.root;
    env.A9_DIAG_RUN_ID = ctx.run;
    env.A9_DIAG_CASE = ctx.caseId;
    const appDir = path.win32.join(ctx.root, 't', 'payload', 'diag-app');
    const chromium = path.win32.join(ctx.dir, 'chromium.log');
    const args = [appDir, '--enable-logging', '--log-file=' + chromium];
    event('launch', { exe: ctx.driver, argv: args, inherited_present: present, gui_present: { ELECTRON_RUN_AS_NODE: false, NODE_OPTIONS: false }, stdio: ['ignore', 'pipe', 'pipe'], clock_domain: 'capturer_only' });
    let child;
    try { child = spawn(ctx.driver, args, { cwd: ctx.dir, env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { event('error', { code: typeof error.code === 'string' ? error.code : 'UNKNOWN', phase: 'spawn_throw' }); process.exitCode = 126; return; }
    let exitSeen = false;
    let closeSeen = false;
    let total = 0;
    let limited = false;
    const streams = { stdout: { bytes: 0, prefix: [] }, stderr: { bytes: 0, prefix: [] } };
    function result() {
      for (const name of Object.keys(streams)) {
        const s = streams[name];
        const prefix = Buffer.concat(s.prefix);
        for (let offset = 0; offset < prefix.length; offset += 8192) {
          event('output_prefix', { stream: name, offset, encoding: 'base64', prefix: prefix.subarray(offset, offset + 8192).toString('base64') });
        }
        event('output_summary', { stream: name, captured_bytes: s.bytes, total_observed_bytes: s.total || 0, prefix_limit: PREFIX_BYTES, output_limit: OUTPUT_LIMIT, beyond_prefix: (s.total || 0) > s.bytes, limit_exceeded: limited });
      }
    }
    function data(name, chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const s = streams[name];
      s.total = (s.total || 0) + bytes.length;
      total += bytes.length;
      const keep = Math.max(0, Math.min(bytes.length, PREFIX_BYTES - s.bytes));
      if (keep) { s.prefix.push(Buffer.from(bytes.subarray(0, keep))); s.bytes += keep; }
      if (total > OUTPUT_LIMIT && !limited) {
        limited = true;
        event('output_limit', { limit_bytes: OUTPUT_LIMIT, observed_bytes: total, action: 'SUPERVISOR_BOUND_TREE_CLEANUP_REQUIRED' });
        const marker = path.win32.join(ctx.dir, 'capture-limit.json');
        safe(marker);
        fs.writeFileSync(marker, JSON.stringify({ kind: 'OUTPUT_LIMIT', limit_bytes: OUTPUT_LIMIT, observed_bytes: total, outcome: 'HALTED' }) + '\n', { encoding: 'utf8', flag: 'wx' });
      }
    }
    child.stdout.on('data', chunk => data('stdout', chunk));
    child.stderr.on('data', chunk => data('stderr', chunk));
    child.on('spawn', () => event('spawn', { pid: child.pid, creation_time: 'UNKNOWN_UNTIL_EXTERNAL_HANDLE_BIND' }));
    child.on('error', error => { event('error', { code: typeof error.code === 'string' ? error.code : 'UNKNOWN', phase: 'child_event' }); process.exitCode = 126; });
    child.on('exit', (code, signal) => { exitSeen = true; event('exit', { pid: child.pid || 'UNKNOWN', code, signal }); });
    const watchdog = setTimeout(() => {
      event('capture_timeout', { exit_seen: exitSeen, close_seen: closeSeen, seconds: 65, exit_close_delay: 'LOWER_BOUND_ONLY' });
      result();
      // Only the supervisor may terminate a bound tree.
      process.exit(124);
    }, 65000);
    child.on('close', (code, signal) => {
      closeSeen = true;
      clearTimeout(watchdog);
      event('close', { pid: child.pid || 'UNKNOWN', code, signal, exit_seen: exitSeen });
      result();
      process.exitCode = limited ? 125 : (Number.isInteger(code) ? code : 126);
    });
  }
  handshake = setInterval(() => {
    safe(ackPath);
    if (fs.existsSync(ackPath)) {
      if (fs.statSync(ackPath).size > 256 || fs.readFileSync(ackPath, 'utf8') !== claim) throw new Error('HANDSHAKE_INSTANCE');
      clearInterval(handshake);
      event('handshake_bound', { pid: process.pid, creation_time: 'EXTERNAL_REGISTRY' });
      launch();
    } else if (process.hrtime.bigint() >= deadline) {
      clearInterval(handshake);
      event('handshake_timeout', { outcome: 'INVALID_CASE' });
      process.exitCode = 125;
    }
  }, 25);
}
if (require.main === module) main();
module.exports = { main, PREFIX_BYTES, OUTPUT_LIMIT };
