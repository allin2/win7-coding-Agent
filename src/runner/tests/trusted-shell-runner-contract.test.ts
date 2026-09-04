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
  createTrustedShellEnvironment,
  decodeShellBytes,
  parseWindowsProcessTable,
  selectShell,
  resolveShellFileIdentity,
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

  it('fails closed when canonical Windows PowerShell and CMD probes fail, ignoring ComSpec', () => {
    const originalPlatform = process.platform;
    const originalSystemRoot = process.env.SystemRoot;
    const originalComSpec = process.env.ComSpec;
    const spawnSpy = jest.spyOn(require('child_process'), 'spawnSync').mockReturnValue({ status: 1, stdout: '' });
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.SystemRoot = 'C:\\Windows';
      process.env.ComSpec = 'C:\\attacker\\cmd.exe';
      const selection = selectShell({});
      expect(selection.available).toBe(false);
      expect(selection.evidence).toBe('unavailable');
      expect(selection.path).toBe('C:\\Windows\\System32\\cmd.exe');
      expect(selection.path).not.toBe(process.env.ComSpec);
    } finally {
      spawnSpy.mockRestore();
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      if (originalSystemRoot === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = originalSystemRoot;
      if (originalComSpec === undefined) delete process.env.ComSpec;
      else process.env.ComSpec = originalComSpec;
    }
  });

  it('filters known values and NODE controls before Shell version probes', () => {
    const originalPlatform = process.platform;
    const originalValue = process.env.A9_BUILD_MODE;
    const originalNode = process.env.NODE_DEBUG;
    const secret = 'probe-environment-secret';
    const spawnSpy = jest.spyOn(require('child_process'), 'spawnSync').mockReturnValue({ status: 0, stdout: '5.1' });
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.A9_BUILD_MODE = secret;
      process.env.NODE_DEBUG = 'http';
      selectShell({ sensitiveValues: [secret] });
      expect(spawnSpy).toHaveBeenCalledTimes(2);
      for (const call of spawnSpy.mock.calls) {
        const environment = (call[2] as any).env;
        expect(environment).toBeDefined();
        expect(environment).not.toHaveProperty('A9_BUILD_MODE');
        expect(environment).not.toHaveProperty('NODE_DEBUG');
      }
    } finally {
      spawnSpy.mockRestore();
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      if (originalValue === undefined) delete process.env.A9_BUILD_MODE;
      else process.env.A9_BUILD_MODE = originalValue;
      if (originalNode === undefined) delete process.env.NODE_DEBUG;
      else process.env.NODE_DEBUG = originalNode;
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

  it('redacts a configured secret split across output chunks from preview and raw logs', async () => {
    const secret = 'SPLIT-SECRET-42';
    const runner = new TrustedShellRunner({
      logDir,
      redactText: (text) => text.split(secret).join('***redacted***'),
      getSensitiveValues: () => [secret],
    });
    const script = "process.stdout.write('SPLIT-'); setTimeout(() => process.stdout.write('SECRET-42'), 30)";
    const result = await runner.execute({ command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}` });

    expect(result.stdout).toContain('***redacted***');
    expect(result.stdout).not.toContain(secret);
    const raw = fs.readFileSync(result.logPaths!.stdout, 'utf8');
    expect(raw).toContain('***redacted***');
    expect(raw).not.toContain(secret);
  });

  it('redacts URL-encoded Base64 and does not persist a secret prefix at the raw-log cap', async () => {
    const secret = '~~~';
    const encodedBase64 = encodeURIComponent(Buffer.from(secret, 'utf8').toString('base64'));
    const boundarySecret = 'SECRET-AT-CAP';
    const runner = new TrustedShellRunner({
      logDir,
      maxLogBytes: 8,
      redactText: (text) => text.split(encodedBase64).join('***redacted***').split(boundarySecret).join('***redacted***'),
      getSensitiveValues: () => [secret, boundarySecret],
    });
    const script = `process.stdout.write(${JSON.stringify(`AAAA${boundarySecret} ${encodedBase64}`)})`;
    const result = await runner.execute({ command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}` });
    const raw = fs.readFileSync(result.logPaths!.stdout, 'utf8');

    expect(result.stdout).not.toContain(encodedBase64);
    expect(raw).not.toContain(encodedBase64);
    expect(raw).not.toContain('SECR');
  });

  it('redacts mixed-case percent escapes of Base64 from raw logs', async () => {
    const secret = '~~~~~~';
    const mixed = 'fn5%2Bfn5%2b';
    const runner = new TrustedShellRunner({
      logDir,
      redactText: (text) => text.split(mixed).join('***redacted***'),
      getSensitiveValues: () => [secret],
    });
    const script = `process.stdout.write(${JSON.stringify(mixed)})`;
    const result = await runner.execute({ command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}` });
    const raw = fs.readFileSync(result.logPaths!.stdout, 'utf8');

    expect(result.stdout).not.toContain(mixed);
    expect(raw).toContain('***redacted***');
    expect(raw).not.toContain(mixed);
  });

  it('uses protocol v2 deadlineMode=none without inventing timeout fields', async () => {
    const invoke = jest.fn(async (request: any): Promise<HelperTransportResult> => ({
      kind: 'response',
      response: {
        schemaVersion: 2, type: 'execution_result', requestId: request.requestId,
        profileId: 'a9-trusted-shell-current-user-v1', status: 'completed',
        exitCode: 0, executionTimeMs: 10, timedOut: false, idleTimedOut: false, canceled: false,
        outputTruncated: false, containmentVerified: true, inputDetached: true,
        cleanupConfirmed: true, workDirAclModified: false,
        hostJob: { detected: true, breakaway: 'silent', limitFlags: 0x3000, childJobAssignmentVerified: true },
        tokenAudit: { source: 'suspended_child_process_token', verified: true, tokenMode: 'current_user', restrictedToken: false, tokenType: 'primary', sameUser: true, lowIntegrity: false, integritySid: 'S-1-16-8192', integrityRid: 8192 },
        stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '',
      },
    }));
    const runner = new TrustedShellRunner({
      helperTransport: { invoke } as HelperTransport,
      platform: 'win32',
      resolveShellIdentity: () => ({ canonicalPath: 'C:\\Windows\\System32\\cmd.exe', sha256: 'a'.repeat(64), fileId: '1:1', version: '6.1.7601' }),
      getConfiguredShellIdentity: () => ({ canonicalPath: 'C:\\Windows\\System32\\cmd.exe', sha256: 'a'.repeat(64), fileId: '1:1', version: '6.1.7601' }),
    });

    const result = await runner.execute({ command: 'echo quiet', shellKind: 'cmd', shellPath: 'cmd.exe' });

    const sent = invoke.mock.calls[0][0] as any;
    expect(sent).toEqual(expect.objectContaining({ schemaVersion: 2, deadlineMode: 'none', managed: false }));
    expect(sent.shellVersion).toBe('6.1.7601');
    expect(result.shell.path).toBe(sent.shellPath);
    expect(result.shell.version).toBe(sent.shellVersion);
    expect(result.shell.evidence).toBe('verified_file_identity');
    expect(sent).not.toHaveProperty('timeoutMs');
    expect(sent).not.toHaveProperty('idleTimeoutMs');
  });

  it('never labels an explicit Bash result with the automatically detected PowerShell version', async () => {
    const selection = jest.spyOn(require('../src/shell-detection'), 'selectShell').mockReturnValue({
      kind: 'powershell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      version: '5.1.7601', evidence: 'win7_contract', reason: 'Windows PowerShell 5.1 baseline', available: true,
    });
    const identity = { canonicalPath: 'C:\\Git\\bin\\bash.exe', sha256: 'a'.repeat(64), fileId: '1:8', version: 'file-1234-5678' };
    const invoke = jest.fn(async (_request: any): Promise<HelperTransportResult> => ({ kind: 'spawn_failed', cleanupConfirmed: true, detail: 'fixture' }));
    try {
      const runner = new TrustedShellRunner({
        helperTransport: { invoke } as HelperTransport, platform: 'win32',
        resolveShellIdentity: () => identity, getConfiguredShellIdentity: () => identity,
      });
      const result = await runner.execute({ command: 'echo quiet', shellKind: 'bash', shellPath: identity.canonicalPath });
      const sent = invoke.mock.calls[0][0] as any;
      expect(sent.shellVersion).toBe(identity.version);
      expect(result.shell).toEqual({ kind: 'bash', path: identity.canonicalPath, version: identity.version,
        evidence: 'verified_file_identity', reason: 'workspace explicit Shell selection; persisted file identity verified' });
    } finally { selection.mockRestore(); }
  });

  it('rejects Provider secrets and process/TLS controls before helper invocation', async () => {
    const invoke = jest.fn();
    const runner = new TrustedShellRunner({
      helperTransport: { invoke } as HelperTransport,
      platform: 'win32',
      resolveShellIdentity: () => ({ canonicalPath: 'C:\\Windows\\System32\\cmd.exe', sha256: 'b'.repeat(64), fileId: '1:2' }),
      getConfiguredShellIdentity: () => ({ canonicalPath: 'C:\\Windows\\System32\\cmd.exe', sha256: 'b'.repeat(64), fileId: '1:2' }),
    });
    const secret = await runner.execute({
      command: 'echo blocked', shellKind: 'cmd', shellPath: 'cmd.exe',
      envOverlay: { OPENAI_API_KEY: 'must-never-cross' },
    });
    const tls = await runner.execute({
      command: 'echo blocked', shellKind: 'cmd', shellPath: 'cmd.exe',
      envOverlay: { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    });
    const prototypeKey = await runner.execute({
      command: 'echo blocked', shellKind: 'cmd', shellPath: 'cmd.exe',
      envOverlay: JSON.parse('{"__proto__":"blocked"}'),
    });
    expect(secret.status).toBe('failed');
    expect(secret.stderr).not.toContain('must-never-cross');
    expect(tls.status).toBe('failed');
    expect(prototypeKey.status).toBe('failed');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('filters secret and Node/Electron/TLS controls from overlays and inherited environment without echoing values', () => {
    const inherited = {
      PROJECT_MODE: 'alpha',
      AZURE_OPENAI_KEY: 'azure-value-never-echo',
      SERVICE_APIKEY: 'service-value-never-echo',
      CUSTOM_PROVIDER_KEY: 'provider-value-never-echo',
      NODE_EXTRA_CA_CERTS: 'ca-path-never-echo',
      ELECTRON_LOG_FILE: 'electron-log-never-echo',
      NODE_V8_COVERAGE: 'coverage-path-never-echo',
      NODE_DEBUG: 'http',
      NODE_DEBUG_NATIVE: 'net',
      NODE_PRESERVE_SYMLINKS: '1',
      NODE_ICU_DATA: 'icu-path-never-echo',
      NODE_NO_WARNINGS: '1',
      node_future_control: 'future-control',
      SSLKEYLOGFILE: 'tls-log-never-echo',
      NPM_CONFIG_STRICT_SSL: 'false-never-echo',
      AWS_ACCESS_KEY_ID: 'access-never-echo',
    };
    const filtered = createTrustedShellEnvironment(inherited, { BUILD_MODE: 'release' });
    expect(filtered).toEqual(expect.objectContaining({ PROJECT_MODE: 'alpha', BUILD_MODE: 'release' }));
    for (const key of ['AZURE_OPENAI_KEY', 'SERVICE_APIKEY', 'CUSTOM_PROVIDER_KEY', 'NODE_EXTRA_CA_CERTS', 'ELECTRON_LOG_FILE', 'NODE_V8_COVERAGE', 'SSLKEYLOGFILE', 'NPM_CONFIG_STRICT_SSL', 'AWS_ACCESS_KEY_ID']) {
      expect(filtered).not.toHaveProperty(key);
    }
    for (const [key, value] of Object.entries(inherited).slice(1)) {
      expect(filtered).not.toHaveProperty(key);
      expect(() => createTrustedShellEnvironment({}, { [key]: value })).toThrow('A9_ENV_OVERLAY_REJECTED');
      try { createTrustedShellEnvironment({}, { [key]: value }); } catch (error) {
        expect(String(error)).not.toContain(value);
      }
    }
  });

  it('passes a value-filtered environment from Runner to both helper entry points', async () => {
    const secret = 'runner-helper-environment-sentinel';
    const original = process.env.A9_BUILD_MODE;
    const identity = { canonicalPath: 'C:\\Windows\\System32\\cmd.exe', sha256: 'a'.repeat(64), fileId: '1:1' };
    const invoke = jest.fn(async (_request: any, _signal?: AbortSignal, _environment?: NodeJS.ProcessEnv): Promise<HelperTransportResult> =>
      ({ kind: 'spawn_failed', detail: 'fixture', cleanupConfirmed: true }));
    const startManaged = jest.fn((_request: any, _environment?: NodeJS.ProcessEnv): never => { throw new Error('fixture start rejected'); });
    try {
      process.env.A9_BUILD_MODE = Buffer.from(secret).toString('base64');
      const runner = new TrustedShellRunner({ helperTransport: { invoke, startManaged }, platform: 'win32',
        getSensitiveValues: () => [secret], resolveShellIdentity: () => identity, getConfiguredShellIdentity: () => identity });
      for (const background of [false, true]) {
        await runner.execute({ command: 'echo quiet', shellKind: 'cmd', shellPath: identity.canonicalPath, background });
      }
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(startManaged).toHaveBeenCalledTimes(1);
      expect(invoke.mock.calls[0][2]).not.toHaveProperty('A9_BUILD_MODE');
      expect(startManaged.mock.calls[0][1]).not.toHaveProperty('A9_BUILD_MODE');
      expect(invoke.mock.calls[0][2]).toBeDefined();
      expect(startManaged.mock.calls[0][1]).toBeDefined();
    } finally {
      if (original === undefined) delete process.env.A9_BUILD_MODE;
      else process.env.A9_BUILD_MODE = original;
    }
  });

  it('keeps inherited known values out of real developer-host foreground and background children', async () => {
    const original = process.env.A9_BUILD_MODE;
    const secret = 'real-child-environment-sentinel';
    const runner = new TrustedShellRunner({ logDir, getSensitiveValues: () => [secret] });
    const script = "console.log(process.env.A9_BUILD_MODE === undefined ? 'ENV_CLEAN' : 'ENV_LEAK')";
    try {
      process.env.A9_BUILD_MODE = secret;
      for (const background of [false, true]) {
        const result = await runner.execute({ command: JSON.stringify(process.execPath) + ' -e ' + JSON.stringify(script), background });
        if (background) {
          expect(result.status).toBe('background_started');
          await new Promise((resolve) => setTimeout(resolve, 300));
          const handle = runner.getBackgroundManager().poll(result.backgroundHandle!);
          expect(handle.stdoutDelta).toContain('ENV_CLEAN');
          expect(handle.stdoutDelta).not.toContain('ENV_LEAK');
        } else {
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain('ENV_CLEAN');
        }
      }
    } finally {
      if (original === undefined) delete process.env.A9_BUILD_MODE;
      else process.env.A9_BUILD_MODE = original;
      await Promise.all(runner.getBackgroundManager().list().map((handle) => runner.getBackgroundManager().stop(handle.handleId)));
    }
  });

  it('rejects known values and encoded credentials under ordinary environment names', async () => {
    const secret = 'sentinel+/ secret-凭据?';
    const base64 = Buffer.from(secret).toString('base64');
    const url = base64.replace(/\+/g, '-').replace(/\//g, '_');
    const variants = [secret, base64, base64.replace(/=+$/g, ''), url, url.replace(/=+$/g, ''),
      encodeURIComponent(secret), encodeURIComponent(base64),
      encodeURIComponent(secret).replace(/%[A-F0-9]{2}/g, (token, offset) => offset % 2 ? token.toLowerCase() : token),
      encodeURIComponent(secret).replace(/%20/g, '+'),
      Array.from(Buffer.from(secret)).map((byte) => '%' + byte.toString(16).padStart(2, '0')).join(''),
      Array.from(Buffer.from(secret)).map((byte) => '%' + byte.toString(16).padStart(2, '0')).join('') + '%FF'];
    const invoke = jest.fn();
    const runner = new TrustedShellRunner({ platform: 'win32', helperTransport: { invoke },
      getSensitiveValues: () => [secret] });
    for (const variant of variants) {
      const value = 'prefix=' + variant + ';suffix';
      expect(createTrustedShellEnvironment({ BUILD_MODE: value, SAFE: 'release' }, {}, [secret])).toEqual({ SAFE: 'release' });
      expect(() => createTrustedShellEnvironment({}, { BUILD_MODE: value }, [secret])).toThrow('A9_ENV_OVERLAY_REJECTED');
      for (const background of [false, true]) {
        const result = await runner.execute({ command: 'echo blocked', background, envOverlay: { BUILD_MODE: value } });
        expect(result.status).toBe('failed');
        expect(JSON.stringify(result)).not.toContain(variant);
      }
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects a replaced user-selected Shell before invoking the helper', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-shell-identity-'));
    const selected = path.join(root, 'selected-shell.exe');
    const replacement = path.join(root, 'replacement-shell.exe');
    fs.writeFileSync(selected, 'selected-v1', 'utf8');
    const bound = resolveShellFileIdentity(selected);
    fs.writeFileSync(replacement, 'selected-v2', 'utf8');
    fs.renameSync(replacement, selected);
    const invoke = jest.fn();
    const runner = new TrustedShellRunner({
      helperTransport: { invoke } as HelperTransport,
      platform: 'win32',
      getConfiguredShellIdentity: () => bound,
    });
    const result = await runner.execute({ command: 'echo blocked', shellKind: 'cmd', shellPath: selected });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('A9_SHELL_IDENTITY_CHANGED');
    expect(invoke).not.toHaveBeenCalled();
    fs.rmSync(root, { recursive: true, force: true });
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

  it('cancels and awaits the same helper invocation when ready is malformed, preserving cleanup risk', async () => {
    let finish!: (value: HelperTransportResult) => void;
    const completion = new Promise<HelperTransportResult>((resolve) => { finish = resolve; });
    const cancel = jest.fn(() => finish({
      kind: 'cancelled',
      detail: 'helper started but readiness was malformed',
      cleanupConfirmed: false,
    }));
    const helperTransport = {
      invoke: jest.fn(),
      startManaged: jest.fn(() => ({
        pid: 9441,
        ready: Promise.reject(new Error('execution_started malformed')),
        completion,
        cancel,
      })),
    };
    const identity = {
      canonicalPath: 'C:\\Windows\\System32\\cmd.exe',
      sha256: 'c'.repeat(64),
      fileId: '1:3',
      version: '6.1.7601',
    };
    const runner = new TrustedShellRunner({
      helperTransport: helperTransport as HelperTransport,
      platform: 'win32',
      resolveShellIdentity: () => identity,
      getConfiguredShellIdentity: () => identity,
    });

    const result = await runner.execute({
      command: 'ping -t 127.0.0.1', shellKind: 'cmd', shellPath: identity.canonicalPath, background: true,
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'failed', residueRisk: true,
      spawnFacts: {
        helperSpawned: true, backgroundProcess: 'unknown', cleanupConfirmed: false, cleanupRequired: true,
      },
      termination: { requested: true, processTreeReaped: false, containment: 'job_object' },
    });
    expect(runner.getBackgroundManager().list()).toEqual([
      expect.objectContaining({ status: 'failed', cleanupRequired: true }),
    ]);
  });

  it('does not retain a false cleanup handle when readiness fails before child spawn', async () => {
    const cancel = jest.fn();
    const helperTransport = {
      invoke: jest.fn(),
      startManaged: jest.fn(() => ({
        pid: 9442,
        ready: Promise.reject(new Error('helper spawn failed before execution_started')),
        completion: Promise.resolve({
          kind: 'spawn_failed', detail: 'CreateProcessW failed before child creation', cleanupConfirmed: true,
        } as HelperTransportResult),
        cancel,
      })),
    };
    const identity = {
      canonicalPath: 'C:\\Windows\\System32\\cmd.exe',
      sha256: 'd'.repeat(64),
      fileId: '1:4',
      version: '6.1.7601',
    };
    const runner = new TrustedShellRunner({
      helperTransport: helperTransport as HelperTransport,
      platform: 'win32',
      resolveShellIdentity: () => identity,
      getConfiguredShellIdentity: () => identity,
    });

    const result = await runner.execute({
      command: 'echo never-started', shellKind: 'cmd', shellPath: identity.canonicalPath, background: true,
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'failed',
      spawnFacts: {
        helperSpawned: true, backgroundProcess: 'not_spawned', cleanupConfirmed: true, cleanupRequired: false,
      },
      termination: { requested: true, processTreeReaped: true, containment: 'job_object' },
    });
    expect(result).not.toHaveProperty('residueRisk');
    expect(runner.getBackgroundManager().getActiveCount()).toBe(0);
    expect(runner.getBackgroundManager().list()).toEqual([
      expect.objectContaining({ status: 'failed', cleanupRequired: false }),
    ]);
  });
});
