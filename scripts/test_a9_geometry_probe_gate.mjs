import assert from 'assert/strict';
import { execFileSync, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

// DOCS_03: the A9-16 geometry probe gate must never write into tracked repository
// paths. Refusal cases need no Chrome; the default-output case runs Chrome only if
// the host has one and must still leave the repository untouched.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = 'docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair';
const gate = process.env.A9_GATE_UNDER_TEST ?? join(root, evidence, 'verify-geometry-probe.mjs');
const REFUSED = 'A9_GEOMETRY_VERIFY_OUT_REFUSED';

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function trackedEvidenceHashes() {
  return git('ls-files', '-z', evidence).split('\0').filter(Boolean)
    .map((file) => `${createHash('sha256').update(readFileSync(join(root, file))).digest('hex')}  ${file}`)
    .join('\n');
}

function runGate(env) {
  const result = spawnSync(process.execPath, [gate], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000,
  });
  const out = result.stdout.match(/^out: (.+)$/m)?.[1] ?? null;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, out };
}

const cleanup = [];
try {
  const hashesBefore = trackedEvidenceHashes();
  const statusBefore = git('status', '--porcelain');

  // 1. Archived evidence directory is refused before anything is written.
  {
    const run = runGate({ A9_GEOMETRY_OUT: join(root, evidence), A9_GEOMETRY_CHROME: '/nonexistent/chrome' });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, new RegExp(REFUSED));
    assert.equal(trackedEvidenceHashes(), hashesBefore);
  }

  // 2. Any other non-ignored directory inside the repository is refused and not created.
  {
    const target = join(root, 'docs', `a9-gate-selftest-${process.pid}`);
    const run = runGate({ A9_GEOMETRY_OUT: target, A9_GEOMETRY_CHROME: '/nonexistent/chrome' });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, new RegExp(REFUSED));
    assert.equal(existsSync(target), false);
  }

  // 3. A git-ignored path inside the repository is accepted.
  {
    const target = join(root, 'outputs', `a9-gate-selftest-${process.pid}`);
    cleanup.push(target);
    const run = runGate({ A9_GEOMETRY_OUT: target, A9_GEOMETRY_CHROME: '/nonexistent/chrome' });
    assert.doesNotMatch(run.stderr, new RegExp(REFUSED));
  }

  // 4. Default output never lands in the repository, with or without Chrome.
  {
    const run = runGate({ A9_GEOMETRY_CHROME: '/nonexistent/chrome' });
    if (run.out) cleanup.push(run.out);
    assert.doesNotMatch(run.stderr, new RegExp(REFUSED));
    assert.equal(git('status', '--porcelain'), statusBefore);
    assert.equal(trackedEvidenceHashes(), hashesBefore);
    if (run.out) assert.equal(resolve(run.out).startsWith(root), false, run.out);
  }

  console.log('a9 geometry probe gate tests: 4/4 PASS');
} finally {
  for (const target of cleanup) rmSync(target, { recursive: true, force: true });
}
