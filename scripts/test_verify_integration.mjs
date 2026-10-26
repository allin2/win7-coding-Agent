import assert from 'assert/strict';
import { readFileSync } from 'fs';
import vm from 'vm';

// Execute the real coordinator with controlled subprocess outcomes. No builds run.
const source = readFileSync(new URL('./verify_integration.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('dirname(dirname(fileURLToPath(import.meta.url)))', "'/repo'");
const names = ['workspace', 'state', 'runner', 'git-adapter', 'gateway', 'core', 'shell'];
const selectedOrder = ['gateway', 'workspace', 'state', 'core', 'runner', 'git-adapter', 'shell'];
function run({ quick = false, failBuild = false, missingDependency = false, customLint = false, nativeBroken = false, args = [] } = {}) {
  const calls = [];
  let exitCode = 0;
  const exit = new Error('exit');
  try {
    vm.runInNewContext(source, {
      process: { argv: ['node', 'verify', ...(quick ? ['--quick'] : []), ...args], platform: 'linux', env: {},
        version: 'v22.0.0', versions: { modules: '127' },
        exit(code) { exitCode = code; throw exit; } },
      console: { log() {}, error() {} },
      join: (...parts) => parts.join('/'),
      createRequire: () => () => {
        if (nativeBroken) throw new Error('was compiled against a different Node.js version');
        return class { close() {} };
      },
      existsSync: (file) => !(missingDependency && file === '/repo/src/runner/node_modules'),
      readFileSync: (file) => file.endsWith('/package.json')
        ? JSON.stringify({ scripts: { lint: file.includes('/shell/') || customLint ? 'tsc --noEmit && check-js' : 'tsc --noEmit', build: 'build', test: 'test' } })
        : readFileSync(new URL(`../${file.slice('/repo/'.length)}`, import.meta.url), 'utf8'),
      spawnSync: (_command, args, options) => {
        calls.push({ name: options.cwd.split('/').pop(), args });
        return { status: failBuild && options.cwd.endsWith('/runner') && args[1] === 'build' ? 1 : 0 };
      },
    });
  } catch (error) { if (error !== exit) throw error; }
  return { calls, exitCode };
}
const full = run();
assert.equal(full.exitCode, 0);
const firstTest = full.calls.findIndex(({ args }) => args[0] === 'test');
assert.equal(firstTest, 8);
assert.deepEqual(full.calls.slice(0, firstTest).filter(({ args }) => args[1] === 'build').map(({ name }) => name), names);
assert.deepEqual(full.calls.slice(firstTest).map(({ name }) => name), selectedOrder);
const quick = run({ quick: true });
assert.equal(quick.exitCode, 0);
assert.equal(quick.calls.length, 8);
assert.ok(quick.calls.every(({ args }) => args[0] !== 'test'));
for (const options of [{ failBuild: true }, { missingDependency: true }]) {
  const failed = run(options);
  assert.equal(failed.exitCode, 1);
  assert.ok(failed.calls.every(({ args }) => args[0] !== 'test'));
}
console.log('PASS: build-before-test, quick mode, failed build and missing dependency barriers');

const runner = run({ args: ['--module', 'runner', '--test-file', 'tests/actual.test.ts'] });
assert.equal(runner.exitCode, 0);
assert.deepEqual(runner.calls.map(({ name }) => name), ['runner', 'runner']);
assert.ok(runner.calls[1].args.includes('--runTestsByPath'));
const shell = run({ quick: true, args: ['--module', 'shell'] });
assert.deepEqual(shell.calls.filter(({ args }) => args[1] === 'build').map(({ name }) => name), names);
const daily = run({ args: ['--daily', '--module', 'workspace'] });
assert.ok(daily.calls[1].args.includes('--testPathIgnorePatterns'));
assert.ok(!run({ args: ['--module', 'workspace'] }).calls[1].args.includes('--testPathIgnorePatterns'));
const dailyShell = run({ args: ['--daily', '--module', 'shell'] }).calls.find(({ args }) => args[0] === 'test');
const namePattern = dailyShell.args[dailyShell.args.indexOf('--testNamePattern') + 1];
assert.ok(!new RegExp(namePattern, 'i').test('A9-39 phase 2 fixed secrets contract B2-A37-02 required fields reject absence and wrong types before comparison'));
assert.ok(new RegExp(namePattern, 'i').test('A9-39 phase 2 fixed secrets contract B2-A37-02 requires a typed envelope and matching case identity'));
const shellFile = run({ args: ['--daily', '--module', 'shell', '--test-file', 'tests/actual.test.ts'] }).calls.find(({ args }) => args[0] === 'test');
assert.ok(!shellFile.args.includes('--testNamePattern'));
assert.ok(!run({ args: ['--module', 'shell'] }).calls.some(({ args }) => args.includes('--testNamePattern')));
for (const module of ['state', 'shell']) {
  const broken = run({ nativeBroken: true, args: ['--module', module] });
  assert.equal(broken.exitCode, 1);
  assert.ok(broken.calls.every(({ args }) => args[0] !== 'test'));
}
assert.equal(run({ nativeBroken: true, args: ['--module', 'runner'] }).exitCode, 0);
assert.equal(run({ nativeBroken: true, quick: true }).exitCode, 0);
for (const args of [['--module', 'unknown'], ['--test-file', 'tests/x.test.ts'], ['--module', 'core', '--test-file', '../x.test.ts'], ['--unknown']]) {
  assert.equal(run({ args }).exitCode, 1);
}
console.log('PASS: scoped builds, exact test paths, explicit slow exclusions, native ABI barrier and full regression retained');

const custom = run({ customLint: true, args: ['--module', 'runner'] });
assert.deepEqual(custom.calls.map(({ args }) => args[1]), ['lint', 'build', '--']);
console.log('PASS: non-duplicate lint is preserved regardless of module directory');
