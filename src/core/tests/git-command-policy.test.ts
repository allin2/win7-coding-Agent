/**
 * A9-05 回归测试：Trusted Git 命令行为策略。
 *
 * 审查缺陷覆盖：不能只依赖简单正则（tokenize 分类器）；push/force push/
 * 远端删除/reset --hard/clean/删除分支需要绑定 remote、branch、force、
 * 删除目标与完整命令摘要的确认；commit 仅用户明确要求；参数变化后旧审批
 * 失效（commandSha256 变化）；fetch/pull/本地分支/add/stash/merge/rebase
 * 按合同可自主执行。
 */
import {
  classifyGitCommand,
  gitApprovalStillValid,
  tokenizeCommand,
} from '../src';

describe('A9-05: git command tokenizer', () => {
  it('tokenizes quoted arguments with spaces and CJK paths', () => {
    expect(tokenizeCommand('git commit -m "fix: 中文 修复" -- path/to file')).toEqual([
      'git', 'commit', '-m', 'fix: 中文 修复', '--', 'path/to', 'file',
    ]);
    expect(tokenizeCommand('git commit -m \'it has "double" inside\'')).toEqual([
      'git', 'commit', '-m', 'it has "double" inside',
    ]);
  });
});

describe('A9-05: git command classification', () => {
  it('classifies read-only and local operations as autonomous', () => {
    for (const cmd of [
      'git status',
      'git diff HEAD~1',
      'git log --oneline -5',
      'git branch',
      'git fetch origin',
      'git add -A',
      'git stash',
      'git merge feature-x',
      'git rebase main',
      'git -C subdir status',
    ]) {
      const decision = classifyGitCommand(cmd);
      expect(`${cmd} => ${decision?.category}`).toBe(`${cmd} => autonomous`);
    }
  });

  it('classifies commit as requiring explicit user request', () => {
    const decision = classifyGitCommand('git commit -m "fix bug"');
    expect(decision?.category).toBe('commit_requires_user_request');
  });

  it('binds push approvals to remote, branch and force flags', () => {
    const plain = classifyGitCommand('git push origin main');
    expect(plain?.category).toBe('always_confirm');
    expect(plain?.binding.remote).toBe('origin');
    expect(plain?.binding.branch).toBe('main');
    expect(plain?.binding.force).toBe(false);

    const force = classifyGitCommand('git push --force origin main');
    expect(force?.binding.force).toBe(true);

    const refspecForce = classifyGitCommand('git push origin +main:main');
    expect(refspecForce?.binding.force).toBe(true);

    const lease = classifyGitCommand('git push --force-with-lease origin main');
    expect(lease?.binding.force).toBe(true);

    const deleteRemote = classifyGitCommand('git push origin --delete feature');
    expect(deleteRemote?.binding.deleteTarget).toBe('feature');
  });

  it('classifies destructive git operations as always-confirm with delete targets', () => {
    const reset = classifyGitCommand('git reset --hard HEAD~2');
    expect(reset?.category).toBe('always_confirm');
    expect(reset?.binding.force).toBe(true);

    // 非 hard reset 可自主。
    expect(classifyGitCommand('git reset --soft HEAD~1')?.category).toBe('autonomous');

    const clean = classifyGitCommand('git clean -fd build/');
    expect(clean?.category).toBe('always_confirm');
    expect(clean?.binding.deleteTarget).toBe('build/');

    const deleteBranch = classifyGitCommand('git branch -D feature-x');
    expect(deleteBranch?.category).toBe('always_confirm');
    expect(deleteBranch?.binding.deleteTarget).toBe('feature-x');
    expect(deleteBranch?.binding.force).toBe(true);

    const remoteBranchDelete = classifyGitCommand('git branch -d origin/feature-x');
    expect(remoteBranchDelete?.binding.deleteTarget).toBe('origin/feature-x');
  });

  it('treats unknown subcommands conservatively (no regex bypass)', () => {
    const decision = classifyGitCommand('git some-future-destructive-cmd --everything');
    expect(decision?.category).toBe('always_confirm');
  });

  it('does not misclassify commands that merely mention git in prose', () => {
    expect(classifyGitCommand('echo "git push origin main"')).toBeNull();
    expect(classifyGitCommand('npm test')).toBeNull();
  });

  it('invalidates approvals when parameters change', () => {
    const first = classifyGitCommand('git push origin main');
    expect(gitApprovalStillValid(first!.binding.commandSha256, 'git push origin main')).toBe(true);
    // 参数变化（换分支）→ 旧审批失效。
    expect(gitApprovalStillValid(first!.binding.commandSha256, 'git push origin develop')).toBe(false);
    expect(gitApprovalStillValid(first!.binding.commandSha256, 'git push --force origin main')).toBe(false);
  });

  it('handles git behind env prefixes and quoted messages', () => {
    const viaEnv = classifyGitCommand('env GIT_EDITOR=true git push origin main');
    expect(viaEnv?.category).toBe('always_confirm');
    expect(viaEnv?.binding.remote).toBe('origin');

    const quoted = classifyGitCommand('git commit -m "git push origin main"');
    expect(quoted?.category).toBe('commit_requires_user_request');
  });
});
