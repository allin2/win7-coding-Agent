import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const GROUPS = ['docs', 'tools', 'product', 'release'];

export function selectGroups(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--all')) return [...GROUPS];
  const selected = [];
  for (let index = 0; index < args.length; index += 2) {
    const group = args[index + 1];
    if (args[index] !== '--group' || !GROUPS.includes(group) || selected.includes(group)) {
      throw new Error('VERIFY_ARGUMENT_INVALID');
    }
    selected.push(group);
  }
  return GROUPS.filter((group) => selected.includes(group));
}

export function commandsFor(group, root = repositoryRoot) {
  const script = (name) => [process.execPath, [join(root, 'scripts', name)]];
  if (group === 'docs') return [script('check_docs.mjs')];
  if (group === 'tools') return ['test_check_docs.mjs', 'test_verify_integration.mjs', 'test_verify_project.mjs'].map(script);
  // The existing coordinator owns build-before-test. Do not build twice.
  if (group === 'product') return [script('verify_integration.mjs')];
  if (group === 'release') {
    const directory = join(root, 'scripts', 'release', 'test');
    const files = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
      .map((entry) => join(directory, entry.name)).sort();
    if (files.length === 0) throw new Error('VERIFY_RELEASE_TESTS_MISSING');
    return [[process.execPath, ['--test', ...files]]];
  }
  throw new Error('VERIFY_GROUP_INVALID');
}

const historicalReplayNames = [
  'historical wrong-choice and late observations remain failure records, while R2 response meanings match',
  'native PS proof body comparison',
  'native import names retain original source closure',
  'ETW red log prefix is replayed without fabricating the missing rejected event',
  'driver sync safety source digest matches original',
  'actual sync snapshot and receipt are uniquely associated; nanosecond boundary violations reject',
  'R2 first failure and original two-row diagnostic remain UNKNOWN/FAIL',
  'original local static factory and CLI generate deterministic bindings',
  'original sync receipt remains a historical local runtime replay',
  'actual immutable R3 returns bind inherited build validator separately from current tools through the real factory and CLI',
  'schema3 factory and CLI consume original component returns without rebinding approval',
];

// A9-43 D4: applicability never turns an unexecuted test into a test pass.
export function releaseNotPerformed(stdout, {
  platform = process.platform, archiveRoot = process.env.A9_WIN10_ARCHIVE_ROOT,
} = {}) {
  const allowed = new Map();
  if (!archiveRoot) for (const name of historicalReplayNames) {
    allowed.set('historical replay: ' + name, {
      category: 'HISTORICAL_ARCHIVE_UNAVAILABLE',
      reason: 'NOT_PERFORMED: set A9_WIN10_ARCHIVE_ROOT to a hash-verified archive restore',
    });
  }
  for (const name of [
    'RC0708 candidate zip layout matches the scratch-rename extraction contract',
    'RC0708 v2 builder binds matching module names and CRLF wrappers',
  ]) allowed.set(name, { category: 'HISTORICAL_CANDIDATE_UNAVAILABLE', reason: 'candidate zip not built locally' });
  if (platform !== 'win32') {
    allowed.set('Windows PowerShell 5.1 executes smoke request copy without building or writing artifacts', {
      category: 'TARGET_PLATFORM_UNAVAILABLE', reason: 'Windows PowerShell 5.1 unavailable; NOT_PERFORMED on this host',
    });
    for (const name of [
      'Windows smoke harness syntax and actual execution remain target-platform checks',
      'Windows host gate rejects contradictory and unsupported runtime/registry facts',
    ]) allowed.set(name, { category: 'TARGET_PLATFORM_UNAVAILABLE', reason: 'Windows PowerShell 5.1 NOT_PERFORMED' });
  }
  const seen = new Set();
  return [...String(stdout).matchAll(/^ok \d+ - (.+?) # SKIP(?: (.*))?\r?$/gm)].map((match) => {
    const [, name, reason = ''] = match;
    const rule = allowed.get(name);
    const recognized = rule && rule.reason === reason && !seen.has(name);
    seen.add(name);
    return { name, status: 'NOT_PERFORMED', reason,
      category: recognized ? rule.category : 'UNCLASSIFIED' };
  });
}

export function verifyGroups(groups, {
  root = repositoryRoot, run = spawnSync, clock = Date.now,
  commands = commandsFor, log = (message) => console.log(message),
} = {}) {
  if (!Array.isArray(groups) || groups.length === 0
    || groups.some((group) => !GROUPS.includes(group)) || new Set(groups).size !== groups.length) {
    throw new Error('VERIFY_GROUP_INVALID');
  }
  const results = [];
  let blocked = false;
  for (const group of groups) {
    if (blocked) {
      results.push({ group, status: 'NOT_PERFORMED', reason: 'PREVIOUS_GROUP_FAILED', elapsed_ms: 0 });
      continue;
    }
    const started = clock();
    let failure;
    let testCounts;
    let notPerformed;
    let commandCount = 0;
    try {
      const selected = commands(group, root);
      if (!selected.length) throw new Error('VERIFY_COMMANDS_MISSING');
      for (const [command, args] of selected) {
        log(`[verify-project] ${group}: ${args.join(' ')}`);
        commandCount += 1;
        const releaseTests = group === 'release';
        const result = run(command, args, {
          cwd: root, stdio: releaseTests ? 'pipe' : 'inherit', shell: false,
          ...(releaseTests ? { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 } : {}),
          env: { ...process.env, CI: '1' },
        });
        if (releaseTests) {
          if (result.stdout) log(result.stdout);
          if (result.stderr) log(result.stderr);
          testCounts = {};
          for (const name of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
            const match = String(result.stdout || '').match(new RegExp(`^# ${name} (\\d+)\\r?$`, 'm'));
            testCounts[name] = match ? Number(match[1]) : null;
          }
        }
        if (result.error || result.signal || result.status !== 0) {
          failure = result.error ? 'SUBPROCESS_START_FAILED'
            : result.signal ? 'SUBPROCESS_SIGNALLED' : 'SUBPROCESS_NONZERO_EXIT';
          break;
        }
        if (releaseTests) {
          const counts = testCounts;
          if (Object.values(counts).some((value) => value === null) || counts.tests === 0
            || counts.pass + counts.fail + counts.cancelled + counts.skipped + counts.todo !== counts.tests) {
            failure = 'RELEASE_SUMMARY_INVALID';
          } else if (counts.fail || counts.cancelled) {
            failure = 'RELEASE_TESTS_FAILED';
          } else {
            notPerformed = releaseNotPerformed(result.stdout || '');
            if (counts.todo || notPerformed.length !== counts.skipped
              || notPerformed.some((entry) => entry.category === 'UNCLASSIFIED')) {
              failure = 'RELEASE_TESTS_NOT_PERFORMED';
            }
          }
          if (failure) break;
        }
      }
    } catch {
      failure = 'GROUP_PREPARATION_FAILED';
    }
    blocked = Boolean(failure);
    results.push({ group, status: blocked ? 'FAIL' : 'PASS',
      ...(failure ? { reason: failure } : {}), commands: commandCount,
      ...(testCounts ? { test_counts: testCounts } : {}),
      ...(notPerformed?.length ? { not_performed: notPerformed } : {}),
      elapsed_ms: Math.max(0, clock() - started) });
  }
  return { schema_version: 1, environment: { platform: process.platform, node: process.version },
    scope: groups, status: blocked ? 'FAIL' : 'PASS', groups: results };
}

export function main(args = process.argv.slice(2)) {
  try {
    if (args.length === 1 && args[0] === '--list') {
      console.log(JSON.stringify({ groups: GROUPS }));
      return 0;
    }
    const summary = verifyGroups(selectGroups(args));
    console.log(`[verify-project-summary] ${JSON.stringify(summary)}`);
    console.log('[verify-project] 开发机检查；不等于 Win10/Win7 实机验收。');
    return summary.status === 'PASS' ? 0 : 1;
  } catch {
    console.error('VERIFY_ARGUMENT_OR_GROUP_INVALID');
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
