'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'remaining_acceptance_audit.mjs');
const REMAINING_RUNNER = path.join(HERE, 'run_remaining_win7.mjs');
const input = path.join(HERE, 'evidence', 'A4-20260805-123467', 'A4-20260805-123467-automation.json');
const supplementary = path.join(HERE, 'evidence', 'A4-20260806-140606', 'remote-remaining-results.json');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-remaining-audit-'));
try {
  const help = spawnSync(process.execPath, [SCRIPT, '--help'], {
    cwd: path.resolve(HERE, '..', '..', '..'), encoding: 'utf8', shell: false, timeout: 30000,
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--supplementary/);
  assert.match(help.stdout, /--audit-id/);

  const runnerHelp = spawnSync(process.execPath, [REMAINING_RUNNER, '--help'], {
    cwd: path.resolve(HERE, '..', '..', '..'), encoding: 'utf8', shell: false, timeout: 30000,
  });
  assert.equal(runnerHelp.status, 0, runnerHelp.stderr);
  assert.match(runnerHelp.stdout, /--execute-win7/);
  const runnerWithoutExecute = spawnSync(process.execPath, [REMAINING_RUNNER,
    '--acceptance-id', 'A4-20260806-999998'], {
    cwd: path.resolve(HERE, '..', '..', '..'), encoding: 'utf8', shell: false, timeout: 30000,
  });
  assert.notEqual(runnerWithoutExecute.status, 0);
  assert.match(runnerWithoutExecute.stderr, /explicit --execute-win7 is required/);

  const out = path.join(temp, 'audit.json');
  const run = spawnSync(process.execPath, [SCRIPT, '--input', input, '--supplementary', supplementary,
    '--audit-id', 'A4-20260806-140606-REMAINING', '--out', out], {
    cwd: path.resolve(HERE, '..', '..', '..'), encoding: 'utf8', shell: false, timeout: 30000,
  });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(report.audit_id, 'A4-20260806-140606-REMAINING');
  assert.equal(report.source_supplementary, 'spikes/02-terminal-containment/acceptance/evidence/A4-20260806-140606/remote-remaining-results.json');
  assert.equal(report.safety.ssh_used, false);
  assert.equal(report.safety.private_key_content_read, false);
  assert.equal(report.formal_spike_02_go, 'NO_GO_FORMAL_GAPS');
  assert.equal(report.items.find((item) => item.id === 'AUTO-00..07').status, 'PASS');
  assert.equal(report.items.find((item) => item.id === 'C04').status, 'MANUAL_GATE');
  assert.equal(report.items.find((item) => item.id === 'C02').status, 'PASS');
  assert.equal(report.items.find((item) => item.id === 'C03').status, 'FAIL');
  assert.equal(report.items.find((item) => item.id === 'C05').status, 'ENVIRONMENT_MISSING');
  assert.equal(report.items.find((item) => item.id === 'GATE-PROD')?.status, undefined);
  assert.ok(fs.existsSync(out.replace(/\.json$/, '.html')));
  process.stdout.write('Remaining acceptance audit protection tests: PASS\n');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
