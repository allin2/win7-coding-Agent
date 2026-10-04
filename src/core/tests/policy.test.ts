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
