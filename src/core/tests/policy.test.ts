/**
 * @module policy.test
 * @description Policy 引擎测试 — READ_ONLY、WORKSPACE_WRITE、外部 FULL_ACCESS 拒绝与结构化 argv
 */

import { PolicyEngine } from '../src/policy';
import { ToolCall, ApprovalLevel, PolicyVerdict } from '../src/types';
import { bindCapabilityToToolCall } from '../src/approval-binding';
import { MAX_ANALYZABLE_GIT_COMMAND_BYTES } from '../src/git-command-policy';

function writeCall(id: string = 'call-write'): ToolCall {
  return {
    id,
    toolName: 'fs.writeFile',
    args: { path: '/workspace/file.txt', content: 'hello' },
    approvalLevel: ApprovalLevel.WORKSPACE_WRITE,
    approvalContext: {
      previewSha256: 'preview-sha',
      baselineSha256: 'baseline-sha',
    },
  };
}

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe('READ_ONLY 工具', () => {
    it('白名单内的只读工具始终允许', () => {
      const toolCall: ToolCall = {
        id: 'call-1',
        toolName: 'fs.readFile',
        args: { path: '/some/file.txt' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);
      expect(decision.level).toBe(ApprovalLevel.READ_ONLY);
      expect(decision).toMatchObject({ verdict: PolicyVerdict.ALLOW, ruleId: 'POLICY_READ_ONLY_ALLOWED' });
    });

    it('只读工具无需令牌', () => {
      const toolCall: ToolCall = {
        id: 'call-2',
        toolName: 'fs.readdir',
        args: { path: '/some/dir' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);
    });
  });

  describe('WORKSPACE_WRITE 工具', () => {
    it('无令牌时拒绝', () => {
      const toolCall = writeCall('call-3');
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('能力令牌');
      expect(decision.verdict).toBe(PolicyVerdict.ASK);
    });

    it('即使有令牌 ID，无 tokenValidator 时也 fail-closed', () => {
      const decision = engine.evaluate(writeCall('call-4'), 'some-token-id', 'sess-1');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('fail-closed');
    });

    it('有令牌但 tokenValidator 返回无效时拒绝', () => {
      const engineWithValidator = new PolicyEngine({
        tokenValidator: () => ({ valid: false, reason: '令牌已过期' }),
      });
      const toolCall = writeCall('call-5');
      const decision = engineWithValidator.evaluate(toolCall, 'expired-token', 'sess-1');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('令牌已过期');
    });

    it('令牌缺少 workspace_write 能力时拒绝', () => {
      const engineWithValidator = new PolicyEngine({
        tokenValidator: () => ({
          valid: true,
          token: {
            tokenId: 'tok-1',
            sessionId: 'sess-1',
            capabilities: ['read_only'],
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            revoked: false,
          },
        }),
      });
      const toolCall = writeCall('call-6');
      const decision = engineWithValidator.evaluate(toolCall, 'tok-1', 'sess-1');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('workspace_write');
    });

    it('仅允许会话、请求、预览和基线完全匹配的令牌', () => {
      const toolCall = writeCall('call-bound');
      const token = {
        tokenId: 'tok-bound',
        sessionId: 'sess-1',
        capabilities: ['workspace_write'],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        revoked: false,
        binding: bindCapabilityToToolCall(toolCall),
      };
      const boundEngine = new PolicyEngine({
        tokenValidator: () => ({ valid: true, token }),
      });

      expect(boundEngine.evaluate(toolCall, token.tokenId, 'sess-1').allowed).toBe(true);
      const changed = writeCall('call-bound');
      changed.args = { path: '/workspace/file.txt', content: 'changed' };
      expect(boundEngine.evaluate(changed, token.tokenId, 'sess-1').allowed).toBe(false);
      expect(boundEngine.evaluate(toolCall, token.tokenId, 'other-session').allowed).toBe(false);
    });
  });

  describe('FULL_ACCESS 工具', () => {
    it('在 A9 Full Access 下允许已批准的工具执行（ADR-0089）', () => {
      const toolCall: ToolCall = {
        id: 'call-7',
        toolName: 'shell',
        args: { command: 'git status' },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);
      expect(decision.ruleId).toBe('POLICY_FULL_ACCESS_ALLOWED');
    });

    it('asks before a git push hidden inside a compound CMD payload', () => {
      const decision = engine.evaluate({
        id: 'call-cmd-push',
        toolName: 'shell',
        args: {
          command: 'cmd.exe /d /v:off /c \'set "GIT_CONFIG_COUNT=1" && C:\\tools\\git.exe push a9-win7-13 main:main\'',
        },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      });
      expect(decision).toMatchObject({
        allowed: false,
        verdict: PolicyVerdict.ASK,
        ruleId: 'POLICY_ALWAYS_CONFIRM_REQUIRED',
      });
      expect(decision.reason).toContain('remote=a9-win7-13');
      expect(decision.reason).toContain('branch=main');
    });

    it('asks before any shell command beyond the analysis limit, even without Git (A9-20 G06)', () => {
      const shell = (command: string) => engine.evaluate({
        id: 'call-oversized', toolName: 'shell', args: { command }, approvalLevel: ApprovalLevel.FULL_ACCESS,
      });
      const atLimit = `npm test -- ${'x'.repeat(MAX_ANALYZABLE_GIT_COMMAND_BYTES - 'npm test -- '.length)}`;
      expect(Buffer.byteLength(atLimit, 'utf8')).toBe(MAX_ANALYZABLE_GIT_COMMAND_BYTES);
      expect(shell(atLimit).ruleId).toBe('POLICY_FULL_ACCESS_ALLOWED');
      const oversized = shell(`${atLimit}x`);
      expect(oversized).toMatchObject({ verdict: PolicyVerdict.ASK, ruleId: 'POLICY_ALWAYS_CONFIRM_REQUIRED' });
      expect(oversized.reason).toContain('256 KiB');
      // The limit is in UTF-8 bytes: fewer characters of CJK text already exceed it.
      expect(shell(`npm test -- ${'中'.repeat(90 * 1024)}`).verdict).toBe(PolicyVerdict.ASK);
    });
  });

  it('evaluates approval facts without consulting a token store', () => {
    const call = writeCall('pure-call');
    const token = {
      tokenId: 'pure-token', sessionId: 'sess-1', capabilities: ['workspace_write'],
      expiresAt: '2099-01-01T00:00:00.000Z', revoked: false,
      binding: bindCapabilityToToolCall(call),
    };
    expect(engine.evaluateFacts(call, { sessionId: 'sess-1', token })).toMatchObject({
      verdict: PolicyVerdict.ALLOW,
      ruleId: 'POLICY_APPROVAL_BOUND',
    });
  });

  describe('工具名白名单验证', () => {
    it('不在白名单内的工具被拒绝', () => {
      const toolCall: ToolCall = {
        id: 'call-8',
        toolName: 'malicious.tool',
        args: {},
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('白名单');
    });
  });

  describe('结构化参数验证', () => {
    it('文件名中的元字符作为普通数据允许通过', () => {
      const toolCall: ToolCall = {
        id: 'call-9',
        toolName: 'fs.readFile',
        args: { path: '/workspace/a|b;$(literal).txt' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);
    });

    it('terminal.exec 拒绝 commandLine 字符串', () => {
      const toolCall: ToolCall = {
        id: 'call-10',
        toolName: 'terminal.exec',
        args: { commandLine: 'git status && whoami' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('command + argv');
    });

    it('terminal.exec 拒绝通用 Shell 宿主', () => {
      const toolCall: ToolCall = {
        id: 'call-11',
        toolName: 'terminal.exec',
        args: { command: 'cmd.exe', argv: ['/c', 'dir'] },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Shell 宿主');
    });

    it('terminal.exec requires an approved command profile even with structured argv', () => {
      const toolCall: ToolCall = {
        id: 'call-12',
        toolName: 'terminal.exec',
        args: { command: 'rg.exe', argv: ['a|b', '/workspace'] },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision).toMatchObject({
        allowed: false,
        ruleId: 'POLICY_COMMAND_PROFILE_REQUIRED',
      });
    });

    it.each([
      'C:\\Windows\\System32\\config\\SAM',
      'C:\\repo\\.env',
      'C:\\repo\\.git\\config',
    ])('rejects direct access to sensitive path %s', (path) => {
      const decision = engine.evaluate({
        id: 'sensitive-path', toolName: 'fs.readFile', args: { path }, approvalLevel: ApprovalLevel.READ_ONLY,
      });
      expect(decision).toMatchObject({ verdict: PolicyVerdict.DENY, ruleId: 'POLICY_SENSITIVE_PATH_DENIED' });
    });
  });

  describe('自定义白名单', () => {
    it('使用自定义白名单覆盖默认', () => {
      const customEngine = new PolicyEngine({
        toolWhitelist: new Set(['custom.tool']),
      });
      const toolCall: ToolCall = {
        id: 'call-18',
        toolName: 'custom.tool',
        args: {},
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = customEngine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);

      // 默认白名单工具应被拒绝
      const defaultTool: ToolCall = {
        id: 'call-19',
        toolName: 'fs.readFile',
        args: {},
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision2 = customEngine.evaluate(defaultTool);
      expect(decision2.allowed).toBe(false);
    });
  });
});


describe('A9-31 Shell permanent deletion confirmation', () => {
  const engine = new PolicyEngine();
  const evaluateShell = (command: string) => engine.evaluate({
    id: 'delete-policy', toolName: 'shell', args: { command }, approvalLevel: ApprovalLevel.FULL_ACCESS,
  });

  it('asks for the exact r2 Win10 unconfirmed Remove-Item command', () => {
    const command = "Remove-Item -LiteralPath 'C:\\Users\\a9builder.WIN-2JQ66JE4HTQ\\AppData\\Local\\A9-A31-Product-R2-20261004-R1\\runs\\1c1848e6c2d446438f0e6ab355c2dfbb\\workspace\\中文 路径\\confirmation-must-not-run' -Force";
    expect(evaluateShell(command)).toMatchObject({
      allowed: false, verdict: PolicyVerdict.ASK, ruleId: 'POLICY_ALWAYS_CONFIRM_REQUIRED',
    });
  });

  it.each([
    'Remove-Item -LiteralPath "C:\\中文 路径\\x" -Recurse -Force',
    'rEmOvE-iTeM x', 'ri x', 'rm -rf x', 'rmdir x', 'rd /s /q x', 'del /f /q x', 'erase x', 'unlink x',
    '"C:\\tools path\\rm.exe" -rf "C:\\中文 路径\\x"',
    'Microsoft.PowerShell.Management\\Remove-Item x', '/bin/rm -rf x', '@del x', 'call del x', 'env A=1 rm x',
    'Re`move-Item x', 'd^el x',
    'Write-Output ready; Remove-Item x', 'Write-Output ready|Remove-Item x', 'echo ready&&del x',
    '# harmless deletion text\nRemove-Item x', 'Write-Output ready # del x\nRemove-Item x',
    '<# del x #> Remove-Item y',
    'git status; Remove-Item x -Force', 'git diff && rm -rf x',
    'if ($true) { Remove-Item x }', 'if exist "中文 路径" del x', 'if not defined X rd x',
    'if errorlevel 1 erase x', 'if x==x del x', 'for %f in (x) do del %f',
    'foreach ($x in @(1)) { Remove-Item x }', 'while ($true) { rm x }',
    'Write-Output $(Remove-Item x)', 'Write-Output "$(Remove-Item x)"',
    "Write-Output $(Write-Output 'data'; Remove-Item x)",
    `Write-Output "$(Write-Output "$(Remove-Item x)")"`,
    "& 'Microsoft.PowerShell.Management\\Remove-Item' x", "$delete='Remove-Item'; & $delete x",
    'set D=del & %D% x', "Invoke-Expression 'Remove-Item x'",
    'cmd.exe /d /c "del /f x"', 'cmd /c"del x"', 'cmd /s/c "erase x"', 'cmd /cdel x',
    `cmd /c "# ordinary CMD text & del x"`, `cmd /c "echo 'ordinary CMD text & del x'"`,
    'cmd /c "echo text`&del x"', 'Write-Output text^; Remove-Item x',
    'if x EQU x del y',
    'powershell.exe -NoProfile -Command "Remove-Item x"', 'powershell -c"Remove-Item x"',
    'powershell -ExecutionPolicy Bypass -Command "Remove-Item x"',
    'powershell -Command Remove-Item x', "powershell -Command 'if ($true) { Remove-Item x }'",
    'powershell -Command:Remove-Item x', 'sh -lc "rm -rf x"',
    `powershell -EncodedCommand ${Buffer.from('Remove-Item x', 'utf16le').toString('base64')}`,
    `powershell -ec ${Buffer.from('Write-Output ready; ri x', 'utf16le').toString('base64')}`,
    `cmd /c '${'powershell -Command "'.repeat(6)}Remove-Item x${'"'.repeat(6)}'`,
  ])('asks for deletion execution: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({
      verdict: PolicyVerdict.ASK, ruleId: 'POLICY_ALWAYS_CONFIRM_REQUIRED', allowed: false,
    });
  });

  it.each([
    'git status', 'npm test', 'Get-Content "C:\\中文 路径\\rm"',
    'echo Remove-Item x', 'echo "del x; rm y"', 'printf "rm -rf x"',
    'Write-Output "Remove-Item x"', "Write-Output 'del x; rm y'", 'Write-Host "ri x"',
    'Write-Output "rmdir (x)"', "Write-Output '$(Remove-Item x)'", `Write-Output "$(Write-Output 'rm')"`,
    'Write-Output "`$(Remove-Item x)"', 'echo "d^el x"',
    '# Remove-Item x; rm y', '<# Remove-Item x; del y #> Write-Output ready',
    'Write-Output ready # Remove-Item x; del y', 'rem del x', ':: rm x',
    'if exist x echo del y', 'if not exist x echo rm y',
    'if exist x echo "text; del y"',
    'cmd /c "echo del x"', 'cmd /c echo "del x; rm y"',
    'cmd /c "echo text; del x"', 'cmd /c "rem text; del x"',
    'cmd /c "echo text^& del x"', 'Write-Output text`; Remove-Item x',
    `powershell -Command "Write-Output 'rm x; Remove-Item y'"`,
    "powershell -Command Write-Output 'rm x; Remove-Item y'",
    `powershell -EncodedCommand ${Buffer.from("Write-Output 'rm x; del y'", 'utf16le').toString('base64')}`,
    'git status; Write-Output "Remove-Item x"',
  ])('keeps pure data or ordinary reads autonomous: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ALLOW, allowed: true });
  });

});

describe('A9-31 adjacent non-Git high-impact execution', () => {
  const engine = new PolicyEngine();
  const evaluateShell = (command: string) => engine.evaluate({
    id: 'adjacent-policy', toolName: 'shell', args: { command }, approvalLevel: ApprovalLevel.FULL_ACCESS,
  });

  it.each([
    'git status; npm publish', 'npm.cmd publish', 'npm --registry https://example.invalid publish',
    "powershell -Command 'np`m publish'", 'git diff && yarn publish', 'pnpm.bat publish',
    '"C:\\包工具 路径\\npm.cmd" --registry=https://example.invalid publish --tag next',
    'npm --workspace "中文 workspace" publish', 'npm --tag next publish',
    'npm --color publish', 'npm --color --registry https://example.invalid publish',
    'npm --unknown-option value publish', 'cargo --config "registry.token=redacted" publish',
    'twine.exe --no-color upload dist/example.whl', 'twine --repository-url https://example.invalid upload x.whl',
    'cmd /c "git status & n^pm.cmd publish"', 'cmd /c"npm.cmd publish"',
    "powershell -Command 'if ($true) { npm publish }'", 'if exist package.json npm.cmd publish',
    'for %f in (x) do npm.cmd publish', 'Write-Output "$(npm publish)"',
    `powershell -EncodedCommand ${Buffer.from('npm.cmd publish', 'utf16le').toString('base64')}`,
    'git status & reg.exe add HKCU\\Software\\A9PolicyProbe /v X /d 1',
    'r^eg.exe add HKCU\\Software\\A9PolicyProbe /v X /d 1',
    'git status; sc.exe delete A9PolicyProbe', 'git status; icacls.exe C:\\work /grant user:F',
    'reg.exe import probe.reg', 'reg restore HKCU\\Software\\A9PolicyProbe probe.hiv',
    'reg load HKU\\A9PolicyProbe probe.hiv', 'reg unload HKU\\A9PolicyProbe',
    'reg copy HKCU\\Software\\A9PolicyProbe HKCU\\Software\\A9PolicyOther /f',
    'sc.exe stop A9PolicyProbe', 'sc \\\\server config A9PolicyProbe start= auto',
    'sc.exe sdset A9PolicyProbe D:example', 'net.exe user A9PolicyProbe secret /add',
    'powershell -Command "r`eg.exe delete HKCU\\Software\\A9PolicyProbe"',
    'cmd /c "if exist x sc.exe delete A9PolicyProbe"', 'Write-Output "$(sc.exe stop A9PolicyProbe)"',
    'npm install -g example', 'npm --global install example', 'npm install --global=true example',
    'npm --prefix "C:\\tools path" install -g example', 'pnpm add --global example',
    'yarn global add example', 'cargo install example', 'cargo uninstall example',
    'git status; npm.cmd uninstall --global example',
    "$tool='npm'; & $tool publish", 'cmd /c "set PKG=npm & %PKG% publish"',
    "$tool='sc.exe'; & $tool delete A9PolicyProbe",
    "$tool='reg.exe'; & $tool add HKCU\\Software\\A9PolicyProbe /v X /d 1",
    "$tool='npm.cmd'; & $tool --registry https://example.invalid publish",
    'cmd /c "set PKG=npm.cmd & %PKG% --registry https://example.invalid publish"',
    'cmd /c "set PKG=sc.exe & %PKG% stop A9PolicyProbe"',
    'npm -- --registry publish',
    'cmd /c "set PKG=npm & if exist package.json %PKG% publish"',
    "$tool='npm'; Write-Output \"$(&$tool publish)\"", "${tool}='npm'; & ${tool} publish",
    // Existing dynamic-execution hardening remains conservative even for a
    // literal npm test payload; the non-Git scan must not weaken the Git gate.
    "Invoke-Expression 'npm test'",
  ])('requires bound approval for actual high-impact execution: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ASK, allowed: false, ruleId: 'POLICY_ALWAYS_CONFIRM_REQUIRED' });
  });

  it.each([
    'Write-Output "npm publish"', 'Write-Output "reg.exe delete HKCU\\Software\\A9PolicyProbe"',
    'echo "npm publish; reg delete x"', "printf 'sc delete x; npm publish'", 'rem npm publish',
    '# npm publish; reg delete x', '<# sc delete x; npm publish #> Write-Output ready',
    'Write-Output ready # reg delete x', 'git status; Write-Output "npm publish"',
    'Write-Output "npm publish; $(Write-Output ready)"', "Write-Output '$(npm publish)'",
    'Write-Output "`$(npm publish)"', 'if exist x echo npm publish',
    'cmd /c "echo npm publish"', 'cmd /c "echo text; sc delete x"', 'cmd /c "echo text^& sc delete x"',
    "powershell -Command Write-Output 'npm publish; reg delete x'",
    `powershell -EncodedCommand ${Buffer.from("Write-Output 'npm publish; reg delete x'", 'utf16le').toString('base64')}`,
    'npm test', 'npm install example', 'npm install --global=false example', 'npm run publish',
    'npm --registry publish test', 'npm --workspace publish test', 'npm --tag publish test',
    'cargo test', 'pnpm add example', 'yarn add example', 'yarn global list',
    'reg query HKCU\\Software\\A9PolicyProbe', 'sc.exe query A9PolicyProbe',
    'git status; reg query HKCU\\Software\\A9PolicyProbe',
    'Get-Content "npm publish"', 'rg "sc.exe delete" README.md',
    'cmd /c "for %f in (x) do npm test"',
    'if x EQU x npm test', 'if /i not x EQU y echo npm publish',
    'cargo --color publish test',
    "$text='npm'; Write-Output $text", "$text='sc.exe'; Write-Output $text",
    "$tool='npm'; & $tool test", 'cmd /c "set PKG=npm & %PKG% test"',
    "$tool='npm'; $tool='echo'; & $tool publish",
    "$tool='npm'; Write-Output '$(&$tool publish)'",
    'cmd /c "set PKG=npm & if exist package.json echo %PKG% publish"',
  ])('keeps ordinary commands and literal high-impact words autonomous: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ALLOW, allowed: true });
  });
});

describe('A9-31 Shell Policy quote and control-flow ambiguity (ADR-0181)', () => {
  const engine = new PolicyEngine();
  const evaluateShell = (command: string) => engine.evaluate({
    id: 'ambiguity-policy', toolName: 'shell', args: { command }, approvalLevel: ApprovalLevel.FULL_ACCESS,
  });

  it.each([
    // PowerShell and cmd do not treat a backslash as a quote escape (Codex P1-1).
    'Write-Output "C:\\"; npm publish',
    'Write-Output "C:\\"; sc.exe delete A9ReviewProbe',
    'Write-Output "C:\\"; Remove-Item -LiteralPath "C:\\a9-review-target" -Force',
    'echo "C:\\" & npm publish',
    // An assignment inside a branch or loop body is only a possible value (Codex P1-2).
    "$tool='npm'; if ($false) { $tool='echo' }; & $tool publish",
    "$tool='npm'; foreach ($x in @()) { $tool='echo' }; & $tool publish",
    "$tool='npm'; while ($false) { $tool='echo' }; & $tool publish",
    "$tool='echo'; if ($env:A9_FLAG) { $tool='npm' }; & $tool publish",
  ])('asks when either reading reaches high-impact execution: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ASK, allowed: false });
  });

  it.each([
    'Write-Output "hello"; Get-ChildItem',
    'Write-Output "C:\\"; npm test',
    'echo "C:\\" & npm test',
    "$tool='echo'; if ($true) { $tool='echo' }; & $tool publish",
    "$tool='npm'; $tool='echo'; & $tool publish",
    // The host payload comes from the tokenizer, not the segment reading; it is
    // `echo "npm publish"`, printed data (native argument parsing not verified).
    'bash -c "echo \\"npm publish\\""',
  ])('keeps unambiguous ordinary commands autonomous: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ALLOW, allowed: true });
  });
});

describe('A9-31 Shell Policy assignment effects reaching the current scope (ADR-0182)', () => {
  const engine = new PolicyEngine();
  const evaluateShell = (command: string) => engine.evaluate({
    id: 'scope-policy', toolName: 'shell', args: { command }, approvalLevel: ApprovalLevel.FULL_ACCESS,
  });

  it.each([
    // An unknown value assigned in a branch keeps the conservative unresolved path.
    "$tool='echo'; if ($true) {$tool=$env:ComSpec}; & $tool /c 'npm publish'",
    "$tool='echo'; if ($true) {$tool=$env:ComSpec}; & $tool /c 'sc.exe delete A9ReviewProbe'",
    // CMD IF/FOR bodies and quoted subexpressions assign in the current scope.
    'cmd /v:on /c "set PKG=echo& if 1==1 set PKG=npm& !PKG! publish"',
    "$tool='echo'; Write-Output \"$($tool='npm')\"; & $tool publish",
    // Dot-sourcing brings a function or script block's assignments into this scope.
    "function f {$tool='npm'}; $tool='echo'; . f; & $tool publish",
    "$b={$tool='npm'}; $tool='echo'; . $b; & $tool publish",
  ])('asks when a possible assignment reaches high-impact execution: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ASK, allowed: false });
  });

  it.each([
    "$tool='npm'; $tool='echo'; & $tool publish",
    'cmd /v:on /c "set PKG=echo& if 1==1 set PKG=echo& !PKG! publish"',
  ])('keeps assignments that cannot reach high impact autonomous: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ALLOW, allowed: true });
  });
});

describe('A9-31 Shell Policy variable dispatch under control flow is confirmed (ADR-0183)', () => {
  const engine = new PolicyEngine();
  const evaluateShell = (command: string) => engine.evaluate({
    id: 'dispatch-policy', toolName: 'shell', args: { command }, approvalLevel: ApprovalLevel.FULL_ACCESS,
  });

  it.each([
    // Codex round-3 counterexamples (r2 lost the unknown value or nested assignments).
    "$tool=$env:ComSpec; if ($false) { Write-Output \"$($tool='echo')\" }; & $tool /c 'npm publish'",
    "function f {}; if ($false) {$tool='echo'}; $tool=$env:ComSpec; . f; & $tool /c 'npm publish'",
    'cmd /v:on /c "set PKG=echo& if 1==1 if 1==1 set PKG=npm& !PKG! publish"',
    "$tool='echo'; Write-Output \"$(Write-Output \"$($tool='npm')\")\"; & $tool publish",
    'cmd /v:on /c "set PKG=echo& for %i in (1) do if 1==1 set PKG=npm& !PKG! publish"',
    'cmd /v:on /c "set PKG=echo& call set PKG=npm& !PKG! publish"',
    "function f { Write-Output \"$($tool='npm')\" }; $tool='echo'; . f; & $tool publish",
    "function f {$tool='npm'}; $tool='echo'; Write-Output \"$(. f)\"; & $tool publish",
    // Accepted conservative confirmations: control flow plus a high-impact word.
    "$tool='npm'; if ($false) { $tool='echo' }; & $tool test",
    "function f {$tool='npm'}; $tool='echo'; & $tool publish",
  ])('asks for variable dispatch under control flow with a high-impact word: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ASK, allowed: false });
  });

  it('never relaxes a pre-repair confirmation across the 432 control-flow combinations', () => {
    const inits = ["$tool='echo'; ", "$tool='npm'; ", '$tool=$env:ComSpec; ', ''];
    const assigns = ["$tool='echo'", "$tool='npm'", '$tool=$env:ComSpec'];
    const structs = [
      (a: string) => `if ($false) { ${a} }; `, (a: string) => `if ($true) { ${a} }; `,
      (a: string) => `foreach ($x in @()) { ${a} }; `, (a: string) => `while ($false) { ${a} }; `,
      (a: string) => `switch (1) { 2 { ${a} } }; `, (a: string) => `try { ${a} } catch { }; `,
      (a: string) => `Write-Output "$(${a})"; `, (a: string) => `function f { ${a} }; . f; `,
      (a: string) => `$b={ ${a} }; . $b; `, (a: string) => `function f { ${a} }; `,
      (a: string) => `${a}; `, (a: string) => `if ($false) { Write-Output "$(${a})" }; `,
    ];
    const tails = ['& $tool publish', "& $tool /c 'npm publish'", "& $tool /c 'sc.exe delete A9ReviewProbe'"];
    const combos: string[] = [];
    for (const i of inits) for (const s of structs) for (const a of assigns) for (const t of tails) combos.push(i + s(a) + t);
    expect(combos).toHaveLength(432);
    // Indices the pre-repair Policy (HEAD ebda911) confirmed, frozen from its compiled output.
    const confirmedBefore = [3, 4, 5, 7, 8, 12, 13, 14, 16, 17, 21, 22, 23, 25, 26, 30, 31, 32, 34, 35, 39, 40, 41, 43, 44, 48, 49, 50, 52, 53, 66, 67, 68, 70, 71, 75, 76, 77, 79, 80, 84, 85, 86, 88, 89, 93, 94, 95, 97, 98, 111, 112, 113, 115, 116, 120, 121, 122, 124, 125, 129, 130, 131, 133, 134, 138, 139, 140, 142, 143, 147, 148, 149, 151, 152, 156, 157, 158, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 174, 175, 176, 178, 179, 183, 184, 185, 187, 188, 192, 193, 194, 196, 197, 201, 202, 203, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 219, 220, 221, 223, 224, 228, 229, 230, 232, 233, 237, 238, 239, 241, 242, 246, 247, 248, 250, 251, 255, 256, 257, 259, 260, 264, 265, 266, 268, 269, 271, 272, 274, 275, 277, 278, 282, 283, 284, 286, 287, 291, 292, 293, 295, 296, 300, 301, 302, 304, 305, 309, 310, 311, 313, 314, 316, 317, 319, 320, 322, 323, 327, 328, 329, 331, 332, 336, 337, 338, 340, 341, 345, 346, 347, 349, 350, 354, 355, 356, 358, 359, 363, 364, 365, 367, 368, 372, 373, 374, 376, 377, 379, 380, 382, 383, 385, 386, 390, 391, 392, 394, 395, 399, 400, 401, 403, 404, 408, 409, 410, 412, 413, 417, 418, 419, 421, 422, 424, 425, 427, 428, 430, 431];
    const relaxed = confirmedBefore.filter((index) => evaluateShell(combos[index]).verdict !== PolicyVerdict.ASK).map((index) => combos[index]);
    expect(relaxed).toEqual([]);
  });
});

describe('A9-31 Shell Policy R: call forms, inherited context and data text (ADR-0184)', () => {
  const engine = new PolicyEngine();
  const evaluateShell = (command: string) => engine.evaluate({
    id: 'r4-policy', toolName: 'shell', args: { command }, approvalLevel: ApprovalLevel.FULL_ACCESS,
  });

  it.each([
    // Variable call forms beyond simple ASCII names (Codex round 4, P1-1).
    "$script:tool='npm'; if (0) {$script:tool='echo'}; & $script:tool publish",
    "${script:tool}='npm'; if (0) {${script:tool}='echo'}; & ${script:tool} publish",
    "$tool='npm'; if (0) {$tool='echo'}; & $to`ol publish",
    "$工具='npm'; if (0) {$工具='echo'}; & $工具 publish",
    'cmd /v:on /c "set PKG=echo& if 1==1 set PKG=npm& @!PKG! publish"',
    // The enclosing control flow and high-impact word reach nested payloads (P1-2).
    "$tool='npm'; if (0) {$tool='echo'}; Write-Output \"$(& $tool publish)\"",
    'cmd /v:on /c "set PKG=echo& if 1==1 set PKG=npm& if 1==1 !PKG! publish"',
    'cmd /v:on /c "set PKG=echo& if 1==1 set PKG=npm& for %i in (1) do !PKG! publish"',
  ])('asks for variable dispatch in any call form or nested payload: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ASK, allowed: false });
  });

  it.each([
    // Not variable dispatch, or the control-flow word is data (P2-1).
    'if ($true) { npm test }',
    "${tool}='npm'; & ${tool} test",
    "$tool='echo'; & $tool 'if npm'",
    "$tool='echo'; & $tool hello # if npm",
  ])('does not treat conditions, variable braces, quoted data or comments as dispatch under control flow: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ALLOW, allowed: true });
  });
});

describe('A9-31 Shell Policy r5: expressions, lexical calls and bounded context', () => {
  const engine = new PolicyEngine();
  const evaluateShell = (command: string) => engine.evaluate({
    id: 'r5-policy', toolName: 'shell', args: { command }, approvalLevel: ApprovalLevel.FULL_ACCESS,
  });

  it.each([
    "if ($env:CI -eq 'true') { npm test }",
    "foreach ($project in @('core','shell')) { npm test --workspace=$project }",
    "foreach ($crate in @('core','cli')) { cargo test -p $crate }",
    "npm test; $ok = $LASTEXITCODE -eq 0; if ($ok) { Write-Output 'ok' }",
    "if (Test-Path package.json) { Write-Output '& ${tool}'; npm test }",
    'if (Test-Path package.json) { npm test } # example: & ${tool}',
    // The same expression categories with unrelated names/operators, not a variable-name exemption.
    'if ($env:BUILD -ne 0) { cargo test }',
    "foreach ($module in @('a','b')) { npm test --workspace=$module }",
    'npm test; $passed = $LASTEXITCODE -le 0; if ($passed) { cargo test }',
    'if ($count -gt 0 -and $enabled) { npm test }',
    'if ($items -contains 1) { npm test }',
    'if ($count - 1 -gt 0) { npm test }',
    "if ($env:BUILD -e`q 'true') { cargo test }",
    '$result += 1; if ($result -ge 1) { cargo test }',
    "if (Test-Path package.json) { Write-Output '. (${tool-name})'; cargo test }",
    'if (Test-Path package.json) { npm test } <# & (${script:tool}) #>',
  ])('allows ordinary expressions and call-shaped data: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ALLOW, allowed: true });
  });

  const calls = [
    "$b='npm'; if (0) {$b='echo'}; . $b publish",
    "${tool-name}='npm'; if (0) {${tool-name}='echo'}; & (${tool-name}) publish",
    "${script:tool}='npm'; if (0) {${script:tool}='echo'}; & (${script:tool}) publish",
    "$tool='npm'; if (0) {$tool='echo'}; Write-Output \"$(. $tool publish)\"",
    "$tool='npm'; if (0) {$tool='echo'}; Write-Output \"$(& $tool publish)\"",
    "$tool='npm'; if (0) {$tool='echo'}; & ($tool) publish",
    "$script:tool='npm'; if (0) {$script:tool='echo'}; & ($script:tool) publish",
    "${工具-名}='npm'; if (0) {${工具-名}='echo'}; . (${工具-名}) publish",
    "$tool='npm'; if (0) {$tool='echo'}; $tool publish",
  ];
  it.each(calls)('asks for executable variable calls: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ASK, allowed: false });
  });
  it.each(calls)('retains context through one to four EncodedCommand layers: %s', (raw) => {
    let command = raw;
    for (let depth = 1; depth <= 4; depth += 1) {
      command = 'powershell -EncodedCommand ' + Buffer.from(command, 'utf16le').toString('base64');
      expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ASK, allowed: false });
    }
  });
});

describe('A9-31 Shell Policy r6: adjacent operands, indexing and ranges', () => {
  const engine = new PolicyEngine();
  const evaluateShell = (command: string) => engine.evaluate({
    id: 'r6-policy', toolName: 'shell', args: { command }, approvalLevel: ApprovalLevel.FULL_ACCESS,
  });
  it.each([
    "if ($env:CI -eq'true') { npm test }",
    'if ($LASTEXITCODE -ne0) { throw "npm test failed" }',
    "$paths=@('core','shell'); if ($paths[ 0 ] -eq 'core') { npm test }",
    'foreach ($n in ($start .. $end)) { npm test }',
    'foreach ($n in ($start ..$end)) { cargo test }',
    'foreach ($n in ($start.. $end)) { npm test }',
    'if ($env:BUILD -eq"true") { cargo test }',
    "if ($env:BUILD -e`q'true') { npm test }",
    'if ($code -cne0) { npm test }',
    'if ($code -ge-1) { cargo test }',
    'if ($code -eq$expected) { npm test }',
    'if ($code -eq[int]0) { cargo test }',
    "if ($paths [ 0 ] -eq'core') { npm test }",
    "if ($matrix[ 0, 1 ] -eq'core') { cargo test }",
    'if ($matrix[ 0 ][ 1 ] -ne0) { npm test }',
    'if ($paths[ $index ] -ne$null) { cargo test }',
  ])('allows ordinary expression syntax without invocation: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ALLOW, allowed: true });
  });
  it.each([
    // Explicit invocation stays conservative even when an argument resembles an operator or index.
    "$tool='npm'; if (0) {$tool='echo'}; & $tool -eq'true'",
    "$tool='npm'; if (0) {$tool='echo'}; . $tool -ne0",
    "$tools='npm'; if (0) {$tools='echo'}; & $tools[ 0 ] publish",
    "$tool='npm'; if (0) {$tool='echo'}; & $tool .. $end",
    // A parameter beginning with an operator's letters is not that operator.
    "$tool='npm'; if (0) {$tool='echo'}; $tool -eqtrue",
    "$tool='npm'; if (0) {$tool='echo'}; $tool -format",
  ])('retains variable invocation confirmation: %s', (command) => {
    expect(evaluateShell(command)).toMatchObject({ verdict: PolicyVerdict.ASK, allowed: false });
  });
});
