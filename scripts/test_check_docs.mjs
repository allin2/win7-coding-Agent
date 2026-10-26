import assert from 'assert/strict';
import { spawnSync, execFileSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir, devNull } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// DOCS_02: run the real checker inside disposable git repositories. The current
// working tree is never touched.
const checker = join(dirname(fileURLToPath(import.meta.url)), 'check_docs.mjs');
const temporaryRoot = tmpdir();
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CEILING_DIRECTORIES: temporaryRoot,
};
const created = [];

function write(root, relative, content) {
  const filename = join(root, relative);
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, content, 'utf8');
}

function git(root, ...args) {
  return execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], {
    cwd: root, env: gitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

// Minimal fixture that satisfies the checker's task, ADR and status checks.
function fixture({ initGit = true } = {}) {
  const root = mkdtempSync(join(temporaryRoot, 'check-docs-'));
  created.push(root);
  mkdirSync(join(root, 'scripts'));
  copyFileSync(checker, join(root, 'scripts', 'check_docs.mjs'));
  write(root, 'docs/tasks/README.md', '# Tasks\n');
  write(root, 'docs/DECISIONS.md', '# Decisions\n');
  write(root, 'docs/DECISIONS_INDEX.md', '# ADR Index\n');
  write(root, 'docs/index.md', '# Index\n\n[decisions](DECISIONS.md)\n');
  write(root, '.gitignore', 'outputs/\n');
  if (!initGit) return root;
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  const head = git(root, 'rev-parse', 'HEAD');
  write(root, 'docs/status/latest-validation.json', JSON.stringify({ schema_version: 2, head_commit: head }));
  write(root, 'docs/STATUS.md', `# Status\n\n\`${head}\`\n`);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'status');
  return root;
}

function check(root) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'check_docs.mjs')], {
    cwd: root, env: gitEnv, encoding: 'utf8',
  });
  const output = result.status === 0 ? result.stdout : result.stderr;
  return { status: result.status, report: JSON.parse(output.slice(output.indexOf('{'))) };
}

function linkFailures(report) {
  return (report.failures ?? []).filter(({ kind }) => kind === 'link').map(({ file, target }) => `${file} -> ${target}`);
}

try {
  // Baseline: clean fixture passes.
  {
    const root = fixture();
    const { status, report } = check(root);
    assert.equal(status, 0, JSON.stringify(report));
    assert.equal(report.ok, true);
    assert.equal(report.checked_files, 5);
  }

  // Broken links under a git-ignored directory are not checked.
  {
    const root = fixture();
    write(root, 'outputs/snapshot/docs/README.md', '[gone](missing.md)\n');
    write(root, 'outputs/snapshot/README.md', '[gone](missing.md)\n');
    const { status, report } = check(root);
    assert.equal(status, 0, JSON.stringify(report));
    assert.equal(report.checked_files, 5);
  }

  // Untracked, non-ignored documents are still checked.
  {
    const root = fixture();
    write(root, 'docs/new.md', '[gone](missing.md)\n');
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.deepEqual(linkFailures(report), ['docs/new.md -> missing.md']);
  }

  // Tracked documents with broken links fail.
  {
    const root = fixture();
    write(root, 'docs/tracked.md', '[gone](missing.md)\n');
    git(root, 'add', 'docs/tracked.md');
    git(root, 'commit', '-q', '-m', 'broken');
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.deepEqual(linkFailures(report), ['docs/tracked.md -> missing.md']);
  }

  // Chinese and space-containing paths are enumerated verbatim and links resolve.
  {
    const root = fixture();
    write(root, 'docs/中文 目录/说明 文档.md', '[index](../index.md)\n[gone](缺失 文件.md)\n');
    write(root, 'docs/links.md', '[doc](中文 目录/说明 文档.md)\n[encoded](%E4%B8%AD%E6%96%87%20%E7%9B%AE%E5%BD%95/%E8%AF%B4%E6%98%8E%20%E6%96%87%E6%A1%A3.md)\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'unicode');
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.deepEqual(linkFailures(report), [`${join('docs', '中文 目录', '说明 文档.md')} -> 缺失 文件.md`]);
  }

  // Tracked documents deleted from the working tree are skipped, not read.
  {
    const root = fixture();
    write(root, 'docs/gone.md', '# Gone\n');
    git(root, 'add', 'docs/gone.md');
    git(root, 'commit', '-q', '-m', 'gone');
    unlinkSync(join(root, 'docs/gone.md'));
    const { status, report } = check(root);
    assert.equal(status, 0, JSON.stringify(report));
    assert.equal(report.checked_files, 5);
  }

  // Enumeration failure is reported instead of silently walking the whole tree.
  {
    const root = fixture({ initGit: false });
    write(root, 'outputs/snapshot/README.md', '[gone](missing.md)\n');
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.ok(report.failures.some(({ kind }) => kind === 'enumeration'), JSON.stringify(report));
    assert.deepEqual(linkFailures(report), []);
  }

  // DOCS_04: link targets must be part of the repository.
  function reasons(report) {
    return (report.failures ?? []).filter(({ kind }) => kind === 'link').map(({ file, target, reason }) => `${file} -> ${target}: ${reason}`);
  }

  // Existing but git-ignored targets fail.
  {
    const root = fixture();
    write(root, 'outputs/data.md', '# Local only\n');
    write(root, 'docs/ignored-link.md', '[data](../outputs/data.md)\n');
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.deepEqual(reasons(report), ['docs/ignored-link.md -> ../outputs/data.md: target is not part of the repository']);
  }

  // Existing targets outside the repository fail.
  {
    const root = fixture();
    const outside = mkdtempSync(join(temporaryRoot, 'check-docs-outside-'));
    created.push(outside);
    write(outside, 'note.md', '# Outside\n');
    const target = join(outside, 'note.md');
    write(root, 'docs/outside-link.md', `[note](${target})\n`);
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.deepEqual(reasons(report), [`docs/outside-link.md -> ${target}: target is outside the repository`]);
  }

  // Case mismatches fail on both case-insensitive and case-sensitive file systems.
  {
    const root = fixture();
    write(root, 'docs/case-link.md', '[decisions](decisions.md)\n');
    const caseInsensitive = existsSync(join(root, 'docs', 'decisions.md'));
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.deepEqual(reasons(report), [caseInsensitive
      ? 'docs/case-link.md -> decisions.md: target case differs from repository path docs/DECISIONS.md'
      : 'docs/case-link.md -> decisions.md: target does not exist']);
  }

  // Untracked, non-ignored targets are part of the repository.
  {
    const root = fixture();
    write(root, 'docs/new-target.md', '# New\n');
    write(root, 'docs/new-link.md', '[new](new-target.md)\n');
    const { status, report } = check(root);
    assert.equal(status, 0, JSON.stringify(report));
  }

  // Directories containing repository files, and the repository root, are valid targets.
  {
    const root = fixture();
    write(root, 'docs/dir-link.md', '[tasks](tasks/)\n[status](status)\n[root](../)\n');
    const { status, report } = check(root);
    assert.equal(status, 0, JSON.stringify(report));
  }

  // DOCS_05: reports dated on or after 2026-10-06 must not use W05 vague wording.
  function vagueFailures(report) {
    return (report.failures ?? []).filter(({ kind }) => kind === 'vague-wording').map(({ file, line, reason }) => `${file}:${line}: ${reason}`);
  }

  // In-scope report with vague wording fails with file and line.
  {
    const root = fixture();
    write(root, 'docs/reports/2026-10/run_2026-10-06.md', '# Run\n\n结论：基本通过。\n');
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.deepEqual(vagueFailures(report), [
      `${join('docs', 'reports', '2026-10', 'run_2026-10-06.md')}:3: OUTPUT_STYLE W05 vague wording "基本通过"`,
    ]);
  }

  // Reports dated before the effective date, and non-report documents, are not checked.
  {
    const root = fixture();
    write(root, 'docs/reports/2026-10/old_2026-10-05.md', '结论：基本通过。\n');
    write(root, 'docs/plans/plan_2026-10-07.md', '结论：大概可以。\n');
    const { status, report } = check(root);
    assert.equal(status, 0, JSON.stringify(report));
  }

  // Code, block quotes and Chinese quotations are verbatim citations and are skipped.
  {
    const root = fixture();
    write(root, 'docs/reports/2026-10/quote_2026-10-07.md', [
      '负责人回复“差不多可以”，日志原文「似乎超时」。',
      '> 原话：应该可以。',
      '行内 `估计` 不检查。',
      '```text',
      '理论上 PASS',
      '```',
      '结论：PASS。',
      '',
    ].join('\n'));
    const { status, report } = check(root);
    assert.equal(status, 0, JSON.stringify(report));
  }

  // Lines after a closed code fence are checked again.
  {
    const root = fixture();
    write(root, 'docs/reports/2026-11/fence_2026-11-01.md', '```\n好像\n```\n预计通过\n');
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.deepEqual(vagueFailures(report), [
      `${join('docs', 'reports', '2026-11', 'fence_2026-11-01.md')}:4: OUTPUT_STYLE W05 vague wording "预计通过"`,
    ]);
  }

  // DOCS_06: use real Git HEAD baselines for ADR protection and index consistency.
  function adrFixture(label = '状态') {
    const root = fixture();
    const body = `# Decisions\n\n## ADR-0001 Original decision\n\n- ${label}: Accepted (fixture)\n- Decision: Original body.\n`;
    const index = '# ADR Index\n\n| ADR | Title | Status |\n|---|---|---|\n| ADR-0001 | Original decision | Accepted |\n';
    write(root, 'docs/DECISIONS.md', body);
    write(root, 'docs/DECISIONS_INDEX.md', index);
    git(root, 'add', 'docs/DECISIONS.md', 'docs/DECISIONS_INDEX.md');
    git(root, 'commit', '-q', '-m', 'accepted ADR baseline');
    return { root, body, index };
  }

  // Both existing status languages must protect Accepted bodies.
  for (const label of ['状态', 'Status']) {
    const { root, body } = adrFixture(label);
    write(root, 'docs/DECISIONS.md', body.replace('Original body.', 'Changed body.'));
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.ok(report.failures.some(({ kind }) => kind === 'adr-immutability'), JSON.stringify(report));
  }

  // Changing only the status to Superseded keeps the immutable English body intact.
  {
    const { root, body, index } = adrFixture('Status');
    write(root, 'docs/DECISIONS.md', body.replace('Accepted (fixture)', 'Superseded by ADR-0002 (fixture)'));
    write(root, 'docs/DECISIONS_INDEX.md', index.replace('| Accepted |', '| Superseded by ADR-0002 |'));
    const { status, report } = check(root);
    assert.equal(status, 0, JSON.stringify(report));
  }

  // Missing, extra, duplicate, wrong-title and wrong-status index rows all fail.
  for (const mutation of [
    (index) => index.replace('| ADR-0001 | Original decision | Accepted |\n', ''),
    (index) => `${index}| ADR-0002 | Extra decision | Proposed |\n`,
    (index) => `${index}| ADR-0001 | Original decision | Accepted |\n`,
    (index) => index.replace('| Original decision |', '| Wrong title |'),
    (index) => index.replace('| Accepted |', '| Proposed |'),
  ]) {
    const { root, index } = adrFixture();
    write(root, 'docs/DECISIONS_INDEX.md', mutation(index));
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.ok(report.failures.some(({ kind }) => kind === 'adr-index'), JSON.stringify(report));
  }

  // An unknown status must fail closed instead of disabling immutable protection.
  {
    const { root, body } = adrFixture('Status');
    write(root, 'docs/DECISIONS.md', body.replace('Accepted (fixture)', 'Approved (fixture)'));
    const { status, report } = check(root);
    assert.equal(status, 1);
    assert.ok(report.failures.some(({ kind }) => kind === 'adr-metadata'), JSON.stringify(report));
  }

  // Historical approvals remain recorded, but closed tasks must not retain APPROVED.
  for (const [section, taskStatus, expected] of [
    ['历史合同与保留事项', 'APPROVED_FOR_IMPLEMENTATION', 0],
    ['已关闭任务', 'APPROVED_FOR_IMPLEMENTATION', 1],
    ['当前工作与待批准任务', 'COMPLETE', 1],
    ['未分类', 'APPROVED_FOR_IMPLEMENTATION', 1],
  ]) {
    const root = fixture();
    write(root, 'docs/tasks/EXAMPLE.md', `# Example\n\nStatus: ${taskStatus}\nTask Type: DOCUMENTATION_GOVERNANCE\nPhase-Gate: N/A\nWin7-Validation: N/A\n`);
    write(root, 'docs/tasks/README.md', `# Tasks\n\n## ${section}\n\n| [Example](EXAMPLE.md) | DOCUMENTATION_GOVERNANCE | ${taskStatus} | N/A | N/A |\n`);
    const { status, report } = check(root);
    assert.equal(status, expected, JSON.stringify(report));
    if (expected) assert.ok(report.failures.some(({ kind }) => kind === 'task-lifecycle'), JSON.stringify(report));
  }

  console.log('check_docs tests: 29/29 PASS');
} finally {
  for (const root of created) rmSync(root, { recursive: true, force: true });
}
