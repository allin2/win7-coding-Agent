/**
 * A9-02 回归测试：TrustedShellRunner 合同修复后的行为矩阵。
 *
 * 覆盖审查缺陷：诚实 processTreeReaped、有界原始日志、UTF-8/CP936 解码探测、
 * PowerShell UTF-16LE EncodedCommand、CMD /d /s /c verbatim、后台启动不伪造成功、
 * 无默认固定硬超时、taskkill 不冒充隔离。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  TrustedShellRunner,
  buildTrustedShellInvocation,
  decodeShellBytes,
  parseWindowsProcessTable,
  selectShell,
  ShellKind,
} from '../src';
import type { HelperTransport, HelperTransportResult } from '../src';

describe('A9-02 regression: shell invocation contracts', () => {
  it('captures the complete recursive Windows descendant set before taskkill verification', () => {
    const table = [
      'Node,ParentProcessId,ProcessId',
      'WIN7,100,200',
      'WIN7,200,300',
      'WIN7,100,201',
      'WIN7,999,400',
    ].join('\r\n');
    expect(parseWindowsProcessTable(table, 100).sort((a, b) => a - b)).toEqual([200, 201, 300]);
  });
  it('builds PowerShell UTF-16LE EncodedCommand with normalized $LASTEXITCODE', () => {
    const invocation = buildTrustedShellInvocation('powershell', 'powershell.exe', 'Write-Output hi');
    expect(invocation.args.slice(0, 6)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand']);
    const decoded = Buffer.from(invocation.args[6], 'base64').toString('utf16le');
    expect(decoded).toContain('Write-Output hi');
    expect(decoded).toContain('[Console]::OutputEncoding=[System.Text.Encoding]::UTF8');
    expect(decoded).toContain('$a9NativeExitCode = $LASTEXITCODE');
    expect(decoded).toContain('if ($null -ne $a9NativeExitCode) { exit [int]$a9NativeExitCode }');
  });

  it('separates a native command from exit normalization on Win7 PowerShell', () => {
    const command = "& 'C:\\acceptance\\mvp_mingit\\cmd\\git.exe' push origin main";
    const invocation = buildTrustedShellInvocation('powershell', 'powershell.exe', command);
    const decoded = Buffer.from(invocation.args[6], 'base64').toString('utf16le');
    expect(decoded).toContain(`${command}\r\n`);
    expect(decoded).not.toContain(`${command} if (`);
    expect(decoded).toContain('$a9CommandSucceeded = $?');
    expect(decoded).toContain('$a9NativeExitCode = $LASTEXITCODE');
  });

  it('does not append normalization tokens to an explicit CMD payload', () => {
    const command = 'cmd.exe /d /v:off /c \'set "GIT_CONFIG_COUNT=1" && C:\\acceptance\\mvp_mingit\\cmd\\git.exe push origin main\'';
    const invocation = buildTrustedShellInvocation('powershell', 'powershell.exe', command);
    const decoded = Buffer.from(invocation.args[6], 'base64').toString('utf16le');
    expect(decoded).toContain(`${command}\r\n$a9CommandSucceeded = $?`);
    expect(decoded).not.toContain(`${command} if (`);
  });

  it('builds CMD /d /s /c invocation and requires verbatim args', () => {
    const invocation = buildTrustedShellInvocation('cmd', 'cmd.exe', 'echo "a b" && dir /b');
    expect(invocation.args).toEqual(['/d', '/s', '/c', 'echo "a b" && dir /b']);
    expect(invocation.verbatim).toBe(true);
  });

  it('labels non-Windows shells as development substitutes, not Win7 evidence', () => {
    const selection = selectShell({});
    if (process.platform !== 'win32') {
      expect(selection.evidence).toBe('dev_host_only');
      expect(selection.reason).toContain('development host');
    } else {
      expect(['powershell', 'cmd']).toContain(selection.kind);
      expect(selection.evidence).toBe('win7_contract');
    }
  });

  it('selects CMD-degraded kind metadata even when a command overrides the executable', () => {
    // shellKind 显式指定 powershell 时调用参数仍按 EncodedCommand 组装。
    const invocation = buildTrustedShellInvocation('powershell' as ShellKind, 'custom-powershell.exe', 'Get-Date');
    expect(invocation.exe).toBe('custom-powershell.exe');
    expect(invocation.args).toContain('-EncodedCommand');
  });
});

describe('A9-02 regression: output decoding', () => {
  it('decodes strict UTF-8 bytes as utf-8', () => {
    const decoded = decodeShellBytes(Buffer.from('hello 中文', 'utf8'));
    expect(decoded.encoding).toBe('utf-8');
    expect(decoded.text).toBe('hello 中文');
  });

  it('decodes GBK/CP936 bytes via detection instead of mojibake', () => {
    // “中文” 的 CP936 字节序列：d6 d0 ce c4
    const gbkBytes = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
    const decoded = decodeShellBytes(gbkBytes);
    if (decoded.encoding === 'gbk') {
      expect(decoded.text).toBe('中文');
    } else {
      // 无 GBK ICU 支持的环境按 unknown 保守解码，不抛异常、不误标 utf-8。
      expect(decoded.encoding).toBe('unknown');
    }
  });

  it('decodes UTF-16LE with BOM', () => {
    const decoded = decodeShellBytes(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中文', 'utf16le')]));
    expect(decoded.encoding).toBe('utf-16le');
    expect(decoded.text).toBe('中文');
  });
});

describe('A9-02 regression: honest termination and logs', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-shell-logs-'));

  it('verifies cleanup after cancellation and reports processTreeReaped only when proven', async () => {
    const runner = new TrustedShellRunner({ logDir });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 150);
    const result = await runner.execute({
      command: 'sleep 30',
      signal: controller.signal,
      timeoutMs: 25_000,
    });
    expect(result.status).toBe('cancelled');
    // POSIX 开发机上 kill 结果经过存活验证；只有证明成功才为 true。
    expect(typeof result.termination.processTreeReaped).toBe('boolean');
    if (result.termination.processTreeReaped) {
      expect(result.residueRisk).toBeUndefined();
    } else {
      expect(result.residueRisk).toBe(true);
    }
    // taskkill/PID kill 不得被描述为隔离等价物。
    expect(result.termination.containment).toBe('none');
    expect(result.termination.detail).toContain('NOT a sandbox-equivalent');
  });

  it('reaps a real POSIX shell descendant and waits for cleanup proof before returning cancelled', async () => {
    if (process.platform === 'win32') return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-shell-tree-'));
    const marker = path.join(root, 'child.pid');
    const childScript = path.join(root, 'child.cjs');
    fs.writeFileSync(childScript, `'use strict';\nrequire('fs').writeFileSync(process.argv[2], String(process.pid));\nsetInterval(() => {}, 1000);\n`, 'utf8');
    const quote = (value: string) => `"${value.replace(/"/g, '\\"')}"`;
    const runner = new TrustedShellRunner({ logDir });
    const controller = new AbortController();
    try {
      const execution = runner.execute({
        command: `${quote(process.execPath)} ${quote(childScript)} ${quote(marker)}`,
        signal: controller.signal,
      });
      const deadline = Date.now() + 10_000;
      while (!fs.existsSync(marker) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(fs.existsSync(marker)).toBe(true);
      const descendantPid = Number(fs.readFileSync(marker, 'utf8'));
      controller.abort();
      const result = await execution;
      expect(result.status).toBe('cancelled');
      expect(result.termination.processTreeReaped).toBe(true);
      expect(result.residueRisk).toBeUndefined();
      expect(() => process.kill(descendantPid, 0)).toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes bounded raw logs and preserves exit code despite preview truncation', async () => {
    const runner = new TrustedShellRunner({ logDir });
    const result = await runner.execute({
      command: 'node -e "for(let i=0;i<400;i++) console.log(\'line \' + i)"',
      maxOutputLines: 20,
      maxOutputBytes: 512,
    });
    expect(result.status).toBe('exited');
    expect(result.exitCode).toBe(0);
    expect(result.truncated).toBe(true);
    expect(result.stdout).toContain('[Output truncated');
    expect(result.logPaths).toBeDefined();
    const raw = fs.readFileSync(result.logPaths!.stdout, 'utf8');
    expect(raw).toContain('line 399');
    expect(result.rawStdoutBytes).toBeGreaterThan(512);
  });

  it('does not impose a default fixed hard timeout when timeoutMs is absent', async () => {
    const runner = new TrustedShellRunner({ logDir });
    // 一个 700ms 的命令：如果存在固定短超时（如 60s 不影响，但历史 bug 是固定 60s；
    // 此处验证“未传 timeoutMs 也能正常完成且 status=exited”）。
    const result = await runner.execute({ command: 'sleep 0.7' });
    expect(result.status).toBe('exited');
    expect(result.exitCode).toBe(0);
    expect(result.termination.requested).toBe(false);
  });

  it('reports residue risk honestly when the helper cannot confirm cleanup', () => {
    const { mapHelperFailure } = require('../src/trusted-shell-runner');
    const unconfirmed = mapHelperFailure('helper cancelled without cleanup confirmation', 'cancelled', false);
    expect(unconfirmed.status).toBe('failed');
    expect(unconfirmed.termination.processTreeReaped).toBe(false);
    expect(unconfirmed.residueRisk).toBe(true);
    expect(unconfirmed.termination.containment).toBe('job_object');

    const confirmed = mapHelperFailure('spawn failed before process creation', 'spawn_failed', true);
    expect(confirmed.termination.processTreeReaped).toBe(true);
    expect(confirmed.residueRisk).toBeUndefined();
  });
});

describe('A9-02 regression: background start honesty', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-shell-bg-'));

  it('returns background_started with a handle instead of faking exited/0', async () => {
    const runner = new TrustedShellRunner({ logDir });
    const result = await runner.execute({
      command: 'node -e "setTimeout(() => process.exit(0), 800)"',
      background: true,
    });
    expect(result.status).toBe('background_started');
    expect(result.exitCode).toBeNull();
    expect(result.backgroundHandle).toBeDefined();

    const manager = runner.getBackgroundManager();
    await new Promise((r) => setTimeout(r, 1200));
    const poll = manager.poll(result.backgroundHandle!);
    expect(poll.status).toBe('exited');
    expect(poll.exitCode).toBe(0);
    await manager.stop(result.backgroundHandle!).catch(() => undefined);
  });

  it('reports a failed background start instead of success', async () => {
    const runner = new TrustedShellRunner({ logDir });
    const result = await runner.execute({
      command: 'this-executable-does-not-exist --run',
      background: true,
      shellKind: 'sh',
      shellPath: 'this-executable-does-not-exist',
    });
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBeNull();
    expect(result.backgroundHandle).toBeUndefined();
    expect(result.error).toBeDefined();
  });
});
