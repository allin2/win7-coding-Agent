import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, commandsFor, selectGroups, verifyGroups } from './verify_project.mjs';

assert.deepEqual(selectGroups([]), GROUPS);
assert.deepEqual(selectGroups(['--group', 'release', '--group', 'docs']), ['docs', 'release']);
for (const args of [['--group'], ['--quick'], ['--group', 'unknown'], ['--all', '--group', 'docs'],
  ['--group', 'docs', '--group', 'docs']]) assert.throws(() => selectGroups(args));
const calls = [];
const tap = '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const success = verifyGroups(GROUPS, { log() {}, run: (_command, args) => {
  calls.push(args); return { status: 0, stdout: tap };
} });
assert.equal(success.status, 'PASS');
assert.equal(calls.filter((args) => args[0].endsWith('/verify_integration.mjs')).length, 1);
assert.ok(!calls.some((args) => args.includes('--quick')));
assert.deepEqual(success.groups.map((result) => result.status), ['PASS', 'PASS', 'PASS', 'PASS']);
assert.ok(calls[calls.length - 1].includes('--test'));
for (const stdout of ['', tap.replace('# pass 1', '# pass 0').replace('# skipped 0', '# skipped 1'),
  tap.replace('# tests 1', '# tests 0'), tap.replace('# pass 1', '# pass 0').replace('# todo 0', '# todo 1')]) {
  const result = verifyGroups(['release'], { log() {}, run: () => ({ status: 0, stdout }) });
  assert.equal(result.status, 'FAIL');
}
for (const outcome of [{ status: 7 }, { status: null, signal: 'SIGTERM' }, { error: new Error('missing') }]) {
  let count = 0;
  const failed = verifyGroups(GROUPS, { log() {}, run() { count += 1; return outcome; } });
  assert.equal(count, 1);
  assert.equal(failed.status, 'FAIL');
  assert.deepEqual(failed.groups.map((result) => result.status), ['FAIL', 'NOT_PERFORMED', 'NOT_PERFORMED', 'NOT_PERFORMED']);
}
const root = mkdtempSync(join(tmpdir(), 'verify-project-中文 空格-'));
try {
  const directory = join(root, 'scripts', 'release', 'test');
  mkdirSync(directory, { recursive: true });
  assert.throws(() => commandsFor('release', root), /VERIFY_RELEASE_TESTS_MISSING/);
  writeFileSync(join(directory, 'z.test.mjs'), '', 'utf8');
  writeFileSync(join(directory, 'a.test.mjs'), '', 'utf8');
  writeFileSync(join(directory, 'fixture.mjs'), '', 'utf8');
  const commands = commandsFor('release', root);
  assert.deepEqual(commands[0][1], ['--test', join(directory, 'a.test.mjs'), join(directory, 'z.test.mjs')]);
  const unavailable = verifyGroups(['release'], { root: join(root, 'absent'), log() {} });
  assert.equal(unavailable.status, 'FAIL');
  // Real subprocesses prove exit-code and failed-launch propagation without running product builds.
  for (const command of [[process.execPath, ['-e', 'process.exit(9)']], [join(root, 'missing-node'), []]]) {
    const result = verifyGroups(['docs', 'product'], {
      log() {}, commands: () => [command], run: (executable, args, options) =>
        spawnSync(executable, args, { ...options, stdio: 'pipe' }),
    });
    assert.equal(result.status, 'FAIL');
    assert.equal(result.groups[1].status, 'NOT_PERFORMED');
  }
  const skipped = join(directory, 'skipped.test.mjs');
  writeFileSync(skipped, "import test from 'node:test';\ntest('missing required runtime', { skip: true }, () => {});\n", 'utf8');
  const partial = verifyGroups(['release'], {
    log() {}, commands: () => [[process.execPath, ['--test', skipped]]],
  });
  assert.equal(partial.status, 'FAIL');
  assert.equal(partial.groups[0].reason, 'RELEASE_TESTS_NOT_PERFORMED');
  assert.equal(partial.groups[0].test_counts.skipped, 1);
} finally { rmSync(root, { recursive: true, force: true }); }
const cli = fileURLToPath(new URL('./verify_project.mjs', import.meta.url));
const list = spawnSync(process.execPath, [cli, '--list'], { encoding: 'utf8' });
assert.equal(list.status, 0);
assert.deepEqual(JSON.parse(list.stdout).groups, GROUPS);
assert.equal(spawnSync(process.execPath, [cli, '--group', 'unknown'], { encoding: 'utf8' }).status, 1);
console.log('PASS: groups, real CLI, release discovery, single build, failure and downstream barriers');
