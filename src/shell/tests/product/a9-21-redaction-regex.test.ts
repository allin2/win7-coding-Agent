/**
 * A9-21 M1b：URL 凭据脱敏正则线性化。
 *
 * 旧协议名 `[a-z0-9+.-]*` 在连续字母/数字上二次回退；改为 `{0,31}` 后线性，
 * 脱敏输出与旧正则逐字节相同（无锚点，$1 原样写回）。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createA9AgentRuntime, redactUrlUserinfo } = require('../../product/a9-agent-runtime') as {
  createA9AgentRuntime: (options: Record<string, unknown>) => {
    getSnapshot: () => { diagnostics?: { detail?: string; code?: string } };
  };
  redactUrlUserinfo: (text: string) => string;
};

/** 旧正则（基线行为参照）；勿改。每次内联，避免带 g 标志的 lastIndex 污染。 */
function oldRedactUrlUserinfo(text: string): string {
  return String(text == null ? '' : text)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1***redacted***@');
}

const MIB = 1024 * 1024;

function msNow(): number {
  return Date.now();
}

describe('A9-21 M1b: redactUrlUserinfo equivalence with legacy regex', () => {
  const proto32 = 'a'.repeat(32);
  const proto33 = 'a'.repeat(33);
  const corpus: Array<[string, string]> = [
    ['https://user:pass@host/x', 'https://user:pass@host/x'],
    ['git+ssh://u:p@h', 'git+ssh://u:p@h'],
    ['HTTP://A:B@C', 'HTTP://A:B@C'],
    ['s3://k:v@b', 's3://k:v@b'],
    ['protocol exactly 32', `${proto32}://user:pass@host/x`],
    ['protocol exactly 33', `${proto33}://user:pass@host/x`],
    ['no credentials', 'https://example.com/a:b@c'],
    ['multiple urls', 'https://u1:p1@h1/a and git+ssh://u2:p2@h2/b done'],
    ['chinese around', `前缀 https://user:pass@host/x 后缀`],
    ['empty', ''],
    ['colon in path only', 'https://example.com/a:b'],
    ['at in path only', 'https://example.com/a@b'],
  ];

  it.each(corpus)('byte-identical output: %s', (_label, input) => {
    const expected = oldRedactUrlUserinfo(input);
    const actual = redactUrlUserinfo(input);
    expect(actual).toBe(expected);
  });

  it('redacts URL userinfo and keeps scheme', () => {
    expect(redactUrlUserinfo('https://user:pass@host/x')).toBe('https://***redacted***@host/x');
  });

  it('handles null/undefined like String()', () => {
    expect(redactUrlUserinfo(null as unknown as string)).toBe(oldRedactUrlUserinfo(null as unknown as string));
    expect(redactUrlUserinfo(undefined as unknown as string)).toBe(oldRedactUrlUserinfo(undefined as unknown as string));
  });
});

describe('A9-21 M1b: redactUrlUserinfo performance on 1 MiB inputs', () => {
  const cases: Array<[string, string]> = [
    ['continuous letters', 'a'.repeat(MIB)],
    ['letters with one colon', 'a'.repeat(MIB / 2) + ':' + 'a'.repeat(MIB / 2 - 1)],
    ['a:// long : long no at', (() => {
      const xLen = MIB / 2;
      return 'a://' + 'x'.repeat(xLen) + ':' + 'y'.repeat(MIB - 4 - xLen - 1);
    })()],
    ['a://b:c repeated', 'a://b:c '.repeat(Math.ceil(MIB / 8)).slice(0, MIB)],
    ['hex string', 'deadbeef'.repeat(MIB / 8)],
  ];

  it.each(cases)('completes within 1s: %s', (_label, input) => {
    expect(input.length).toBe(MIB);
    const started = msNow();
    const out = redactUrlUserinfo(input);
    const elapsed = msNow() - started;
    expect(typeof out).toBe('string');
    expect(elapsed).toBeLessThan(1000);
  });

  it('1 MiB worst-case letters completes within 1s (explicit measurement)', () => {
    const input = 'a'.repeat(MIB);
    const started = msNow();
    redactUrlUserinfo(input);
    const elapsed = msNow() - started;
    // 供事实报告记录实测毫秒数；硬门仍是 <1s。
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('A9-21 M1b: boundedDiagnosticText via persistence failure path', () => {
  it('redacts credential and bounds length within 2s on 1 MiB error', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-21-m1b-'));
    const workspaceRoot = path.join(root, 'ws');
    const dataRoot = path.join(root, 'data');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(dataRoot, { recursive: true });

    // 凭据放在开头：若未脱敏，slice(0,600) 仍会留下明文 u:p（避免假通过）。
    const huge = 'https://u:p@h ' + 'a'.repeat(MIB);
    const started = msNow();
    const runtime = createA9AgentRuntime({
      workspaceRoot,
      dataRoot,
      ownerId: `m1b-${process.pid}`,
      openDatabase: () => {
        throw new Error(huge);
      },
    });
    const elapsed = msNow() - started;
    const snapshot = runtime.getSnapshot();
    const detail = String(snapshot.diagnostics?.detail || '');

    expect(elapsed).toBeLessThan(2000);
    expect(detail).not.toContain('u:p');
    expect(detail).not.toContain('https://u:p@h');
    expect(detail.length).toBeLessThanOrEqual(600);
    expect(detail.includes('***redacted***')).toBe(true);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
