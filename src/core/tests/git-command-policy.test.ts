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
  MAX_ANALYZABLE_GIT_COMMAND_BYTES,
  tokenizeCommand,
} from '../src';
import { expandShellHostPayloads } from '../src/git-command-policy';

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
      'git pull origin main',
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

  it.each([
    'cmd.exe /v:on /d /s /c "set G=git&!G! p^ush origin main"',
    'powershell.exe -NoProfile -Command "$g=\'git\'; & $g p`ush origin main"',
    'powershell.exe -NoProfile -Command "$env:G=\'git\'; & $env:G push origin main"',
    'powershell.exe -NoProfile -Command "${env:G}=\'git\'; & ${env:G} push origin main"',
  ])('fails closed on escaped or environment-variable git push: %s', (command) => {
    expect(classifyGitCommand(command)?.category).toBe('always_confirm');
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

  it('requires approval for git push inside compound CMD wrappers', () => {
    const command = 'cmd.exe /d /v:off /c \'set "GIT_CONFIG_COUNT=1" && C:\\acceptance\\mvp_mingit\\cmd\\git.exe -c "safe.directory=C:/A9验收/工作区/中文 空格项目-12" push a9-win7-13 a9/win7-13-j4:a9/win7-13-j4\'';
    const decision = classifyGitCommand(command);
    expect(decision?.category).toBe('always_confirm');
    expect(decision?.binding).toMatchObject({
      remote: 'a9-win7-13',
      branch: 'a9/win7-13-j4',
      force: false,
    });
    expect(decision?.binding.commandSha256).toHaveLength(64);
  });

  it('requires approval when a later compound segment is git push', () => {
    const decision = classifyGitCommand('git status && git push origin release');
    expect(decision?.category).toBe('always_confirm');
    expect(decision?.binding).toMatchObject({ remote: 'origin', branch: 'release' });
  });

  it('shows every equally high-risk Git target in a compound approval summary', () => {
    const decision = classifyGitCommand('git push origin main && git push backup release');
    expect(decision?.binding.summary).toContain('remote=origin branch=main');
    expect(decision?.binding.summary).toContain('remote=backup branch=release');
  });

  it('unwraps PowerShell command wrappers without treating echoed prose as execution', () => {
    expect(classifyGitCommand('powershell.exe -NoProfile -Command "git push origin release"')?.category)
      .toBe('always_confirm');
    expect(classifyGitCommand('cmd.exe /d /s /c "echo git push origin release"')).toBeNull();
    expect(classifyGitCommand('echo git push origin release')).toBeNull();
  });

  it('classifies grouped and conditional Git pushes used by Win7 shells', () => {
    for (const command of [
      '(git push origin main)',
      'if exist README.md git push origin main',
      'powershell.exe -NoProfile -Command "if (Test-Path .git) { git push origin main }"',
      'cmd.exe /d /s /c "(git push origin main)"',
      'cmd.exe /d /s /c "if exist alpha.txt (C:\\acceptance\\mvp_mingit\\cmd\\git.exe push origin HEAD:refs/heads/w18-cmd-if)"',
    ]) {
      expect(`${command} => ${classifyGitCommand(command)?.category}`)
        .toBe(`${command} => always_confirm`);
    }
    expect(classifyGitCommand('(git push origin main)')?.binding)
      .toEqual(expect.objectContaining({ remote: 'origin', branch: 'main' }));
    expect(classifyGitCommand('cmd.exe /d /s /c "if exist alpha.txt (C:\\acceptance\\mvp_mingit\\cmd\\git.exe push origin HEAD:refs/heads/w18-cmd-if)"')?.binding)
      .toEqual(expect.objectContaining({ remote: 'origin', branch: 'w18-cmd-if' }));
    expect(classifyGitCommand('if exist README.md echo git push origin main')).toBeNull();
  });

  it('fails closed for unfamiliar CMD and PowerShell control syntax', () => {
    for (const command of [
      'if /i "a"=="A" git push origin main',
      'for %i in (1) do git push origin main',
      'powershell.exe -NoProfile -Command "if($true){git push origin main}"',
      'powershell.exe -NoProfile -Command "& { git push origin main }"',
      'cmd.exe /d /s /c "for %i in (1) do git push origin main"',
    ]) {
      const decision = classifyGitCommand(command);
      expect(`${command} => ${decision?.category}`).toBe(`${command} => always_confirm`);
      expect(decision?.binding).toEqual(expect.objectContaining({
        remote: 'origin', branch: 'main', commandSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }));
    }
  });

  it('fails closed for parenthesized PowerShell dynamic executable and subcommand', () => {
    expect(classifyGitCommand(`$g=('gi'+'t'); $p=('pu'+'sh'); & ($g) ($p) origin main`)?.category)
      .toBe('always_confirm');
  });

  it('fails closed when a shell wrapper receives an entirely dynamic payload', () => {
    expect(classifyGitCommand(`$x=('gi'+'t '+'pu'+'sh origin main'); & cmd /c $x`)?.category)
      .toBe('always_confirm');
    expect(classifyGitCommand(`$x=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('Z2l0IHB1c2ggb3JpZ2luIG1haW4=')); & cmd /c $x`)?.category)
      .toBe('always_confirm');
  });

  it('fails closed for Win7 shell escaping and dynamic Git executable lookup', () => {
    for (const command of [
      'cmd.exe /d /s /c "g^it push origin main"',
      'powershell.exe -NoProfile -Command "g`it push origin main"',
      'cmd.exe /d /s /c "set G=git && %G% push origin main"',
      'cmd.exe /v:on /d /s /c "set G=git&& !G! push origin HEAD:refs/heads/pwn"',
      'powershell.exe -NoProfile -Command "$g=\'git\'; & $g push origin main"',
      'powershell.exe -NoProfile -Command "& (\'g\'+\'it\') push origin main"',
      'powershell.exe -NoProfile -Command "iex \'git push origin main\'"',
      'powershell.exe -NoProfile -Command "Invoke-Expression (\'git \' + \'push origin main\')"',
      'powershell.exe -NoProfile -Command "Write-Output $(git push origin main)"',
      'powershell.exe -NoProfile -Command "Invoke-Expression (\'g\'+\'it push origin main\')"',
      'powershell.exe -NoProfile -Command "$g=\'git\'; & ${g} push origin main"',
      'cmd.exe /v:on /d /s /c "set G=git&!G:~0,3! push origin main"',
      'powershell.exe -Command "$g=\'git\'; $p=\'push\'; & $g $p origin main"',
      'cmd.exe /v:on /c "set G=git&set P=push&!G! !P! origin main"',
      'powershell.exe -Command "Invoke-Expression (\'git p\'+\'ush origin main\')"',
      'powershell.exe -NoProfile -Command "$g=(\'gi\'+\'t\'); $p=(\'pu\'+\'sh\'); & $g $p origin main"',
    ]) {
      const decision = classifyGitCommand(command);
      expect(`${command} => ${decision?.category}`).toBe(`${command} => always_confirm`);
      expect(decision?.binding.commandSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(classifyGitCommand('echo "!G! push origin main"')).toBeNull();
  });

  it('binds push targets after options that consume a separate value', () => {
    expect(classifyGitCommand('git push -o ci.skip origin main')?.binding)
      .toEqual(expect.objectContaining({ remote: 'origin', branch: 'main' }));
    expect(classifyGitCommand('git push --push-option trace=yes origin release')?.binding)
      .toEqual(expect.objectContaining({ remote: 'origin', branch: 'release' }));
    expect(classifyGitCommand('git push --repo backup release')?.binding)
      .toEqual(expect.objectContaining({ remote: 'backup', branch: 'release' }));
    expect(classifyGitCommand('git push --repo=backup release')?.binding)
      .toEqual(expect.objectContaining({ remote: 'backup', branch: 'release' }));
  });

  it('does not treat common prose and comment sinks as Git execution', () => {
    for (const command of [
      'echo git push origin main',
      'rem git push origin main',
      ':: git push origin main',
      'Write-Output "git push origin main"',
      'Write-Host "git push origin main"',
      '# git push origin main',
    ]) expect(classifyGitCommand(command)).toBeNull();
  });
});

describe('A9-20: shell-host payload forms (ADR-0137)', () => {
  const encoded = Buffer.from('git push origin main', 'utf16le').toString('base64');
  const nestEncoded = (levels: number) => {
    let command = 'git push origin main';
    for (let level = 0; level < levels; level += 1) {
      command = `powershell -e ${Buffer.from(command, 'utf16le').toString('base64')}`;
    }
    return command;
  };

  // §2 classes 2-10 and 12: precisely unwrapped, so the approval binds the real target.
  it.each([
    'cmd /c"git push origin main"',
    'cmd /C"git push origin main"',
    'cmd.exe /d /s /c"C:\\g\\git.exe push origin main"',
    'cmd /s/c "git push origin main"',
    'cmd /d/s/c "git push origin main"',
    'cmd /cgit push origin main',
    'cmd /R "git push origin main"',
    'powershell -c "git push origin main"',
    'powershell -co "git push origin main"',
    'powershell -Com "git push origin main"',
    'powershell /Command "git push origin main"',
    'powershell -Command:"git push origin main"',
    'powershell -NoProfile -c"git push origin main"',
    'powershell -ExecutionPolicy Bypass -NoProfile -Command "git push origin main"',
    `powershell -e ${encoded}`,
    `powershell -ec ${encoded}`,
    `powershell.exe -EncodedCommand ${encoded}`,
    'powershell "git push origin main"',
    'powershell -NoProfile "git push origin main"',
    'bash -c "git push origin main"',
    'bash -c"git push origin main"',
    'bash -lc "git push origin main"',
    "bash.exe -lc 'git push origin main'",
    'sh -ec "git push origin main"',
    'zsh -o pipefail -c "git push origin main"',
  ])('requires a target-bound confirmation: %s', (command) => {
    const decision = classifyGitCommand(command);
    expect(decision?.category).toBe('always_confirm');
    expect(decision?.binding.summary).toBe('git push remote=origin branch=main');
  });

  it.each([
    'powershell -File deploy.ps1 "git push origin main"',
    'bash deploy.sh "git push origin main"',
  ])('fails closed when a shell host payload cannot be extracted: %s', (command) => {
    const decision = classifyGitCommand(command);
    expect(decision?.category).toBe('always_confirm');
    expect(decision?.binding.summary).toContain('unclassified');
  });

  it.each([
    'git status && bash deploy.sh "git push origin main"',
    `git status && ${nestEncoded(7)}`,
  ])('does not let a classified sibling hide an opaque or too-deep Git part: %s', (command) => {
    expect(classifyGitCommand(command)?.category).toBe('always_confirm');
  });

  it('does not let a classified sibling hide a dynamic push', () => {
    expect(classifyGitCommand('git status && powershell -c "$g=\'git\'; & $g push origin main"')?.category)
      .toBe('always_confirm');
    // Statically classified Git with ordinary variables keeps its precise category.
    expect(classifyGitCommand('git add %FILE%')?.category).toBe('autonomous');
    expect(classifyGitCommand('git commit -m "update $HOME"')?.category).toBe('commit_requires_user_request');
  });

  it.each([
    'npm test',
    'echo git push origin main',
    'cmd /c echo git push origin main',
    'powershell -c "Write-Output \'git push origin main\'"',
    'bash -lc "echo git push origin main"',
    'powershell -File deploy.ps1',
    'bash deploy.sh',
    'cmd /c cmd /c cmd /c cmd /c echo hello',
  ])('does not flag commands without Git execution: %s', (command) => {
    expect(classifyGitCommand(command)).toBeNull();
  });

  it('fails closed beyond the nesting depth when Git or an unopened shell layer remains', () => {
    for (let levels = 1; levels <= 8; levels += 1) {
      expect(classifyGitCommand(nestEncoded(levels))?.category).toBe('always_confirm');
    }
    // Trade-off: prose nested beyond the depth limit also asks, since the last
    // shell layer was not looked into.
    expect(classifyGitCommand(`${'cmd /c '.repeat(6)}echo hello`)?.category).toBe('always_confirm');
    expect(classifyGitCommand(`${'cmd /c '.repeat(4)}echo hello`)).toBeNull();
  });

  it('classifies up to the size limit and fails closed one byte beyond it', () => {
    const prefix = 'cmd.exe /d /s /c "C:\\g\\git.exe push origin main & rem ';
    const exact = `${prefix}${'x'.repeat(MAX_ANALYZABLE_GIT_COMMAND_BYTES - prefix.length - 1)}"`;
    expect(Buffer.byteLength(exact, 'utf8')).toBe(MAX_ANALYZABLE_GIT_COMMAND_BYTES);
    expect(classifyGitCommand(exact)?.binding.summary).toBe('git push remote=origin branch=main');
    const over = `${exact.slice(0, -1)}x"`;
    expect(classifyGitCommand(over)?.category).toBe('always_confirm');
    expect(classifyGitCommand(over)?.binding.summary).toContain('unclassified');
    // Oversized pure non-Git text stays unflagged here; the policy layer asks instead (G06).
    expect(classifyGitCommand(`npm test -- ${'x'.repeat(MAX_ANALYZABLE_GIT_COMMAND_BYTES)}`)).toBeNull();
  });

  it('expands shell-host payloads for verification bookkeeping', () => {
    expect(expandShellHostPayloads('npm test')).toBe('npm test');
    expect(expandShellHostPayloads('cmd /c npm test')).toBe('npm test');
    expect(expandShellHostPayloads('cmd /c "cmd /c echo done"')).toBe('echo done');
    expect(expandShellHostPayloads('bash -lc "npm test" && echo ok')).toBe('npm test && echo ok');
    expect(expandShellHostPayloads('powershell -File build.ps1')).toBeUndefined();
  });
});
