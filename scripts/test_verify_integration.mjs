import assert from 'assert/strict';
import { readFileSync } from 'fs';
import vm from 'vm';

// Execute the real coordinator with controlled subprocess outcomes. No builds run.
const source = readFileSync(new URL('./verify_integration.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('dirname(dirname(fileURLToPath(import.meta.url)))', "'/repo'");
const names = ['gateway', 'workspace', 'state', 'core', 'runner', 'git-adapter', 'shell'];
function run({ quick = false, failBuild = false, missingDependency = false } = {}) {
  const calls = [];
  let exitCode = 0;
  const exit = new Error('exit');
  try {
    vm.runInNewContext(source, {
      process: { argv: quick ? ['--quick'] : [], platform: 'linux', env: {},
        exit(code) { exitCode = code; throw exit; } },
      console: { log() {}, error() {} },
      join: (...parts) => parts.join('/'),
      existsSync: (file) => !(missingDependency && file === '/repo/src/runner/node_modules'),
      readFileSync: (file) => file.endsWith('/package.json')
        ? JSON.stringify({ scripts: { lint: 'lint', build: 'build', test: 'test' } })
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
assert.equal(firstTest, 14);
assert.deepEqual(full.calls.slice(0, firstTest).filter(({ args }) => args[1] === 'build').map(({ name }) => name), names);
assert.deepEqual(full.calls.slice(firstTest).map(({ name }) => name), names);
const quick = run({ quick: true });
assert.equal(quick.exitCode, 0);
assert.equal(quick.calls.length, 14);
assert.ok(quick.calls.every(({ args }) => args[0] !== 'test'));
for (const options of [{ failBuild: true }, { missingDependency: true }]) {
  const failed = run(options);
  assert.equal(failed.exitCode, 1);
  assert.ok(failed.calls.every(({ args }) => args[0] !== 'test'));
}
console.log('PASS: build-before-test, quick mode, failed build and missing dependency barriers');
